import type { Pool, PoolClient } from "pg";
import type { z } from "zod";
import type { createProcurementSchema, transitionSchema } from "./schemas.js";
import { requiredPermissionForTransition, validateTransition, type ProcurementStatus } from "./workflow.js";

type CreateInput = z.output<typeof createProcurementSchema>;
type TransitionInput = z.output<typeof transitionSchema>;
type Actor = { id: string; permissions: string[] };
type Dependencies = { now?: () => Date };

export class ProcurementNotFoundError extends Error {}
export class ProcurementAccessError extends Error {}
export class ProcurementConflictError extends Error {}

function requestNo(now: Date) {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `PR-${date}-${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`;
}

async function withTransaction<T>(pool: Pick<Pool, "connect">, invoke: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  let started = false;
  try {
    await client.query("BEGIN"); started = true;
    const result = await invoke(client);
    await client.query("COMMIT"); started = false;
    return result;
  } catch (error) {
    if (started) await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

export function createProcurementService(pool: Pick<Pool, "connect" | "query">, dependencies: Dependencies = {}) {
  const now = dependencies.now ?? (() => new Date());
  return {
    async listRequests(actor: Actor, scope: "mine" | "all", status?: ProcurementStatus) {
      if (scope === "all" && !actor.permissions.includes("procurements.read_all")) throw new ProcurementAccessError("Permission denied");
      if (scope === "mine" && !actor.permissions.includes("procurements.read_own") && !actor.permissions.includes("procurements.read_all")) throw new ProcurementAccessError("Permission denied");
      const values: unknown[] = [];
      const where: string[] = [];
      if (scope === "mine") { values.push(actor.id); where.push(`requests.requester_id = $${values.length}`); }
      if (status) { values.push(status); where.push(`requests.status = $${values.length}`); }
      const result = await pool.query(`SELECT requests.*, users.username AS requester_username, users.display_name AS requester_name
        FROM procurement_requests requests JOIN users ON users.id = requests.requester_id
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY requests.created_at DESC`, values);
      return result.rows.map((row) => ({ id: row.id, requestNo: row.request_no, requesterId: row.requester_id, requesterName: row.requester_name || row.requester_username, title: row.title, reason: row.reason, status: row.status, totalEstimatedAmount: Number(row.total_estimated_amount), createdAt: row.created_at, updatedAt: row.updated_at }));
    },

    async getRequest(id: string, actor: Actor) {
      const result = await pool.query(`SELECT requests.*, users.username AS requester_username, users.display_name AS requester_name
        FROM procurement_requests requests JOIN users ON users.id = requests.requester_id WHERE requests.id = $1`, [id]);
      const request = result.rows[0];
      if (!request) throw new ProcurementNotFoundError("Procurement request not found");
      if (request.requester_id !== actor.id && !actor.permissions.includes("procurements.read_all")) throw new ProcurementAccessError("Permission denied");
      const [items, comments, history] = await Promise.all([
        pool.query("SELECT * FROM procurement_request_items WHERE request_id = $1 ORDER BY sort_order, id", [id]),
        pool.query("SELECT comments.*, users.display_name AS author_name FROM procurement_comments comments JOIN users ON users.id = comments.author_id WHERE request_id = $1 ORDER BY comments.created_at", [id]),
        pool.query("SELECT history.*, users.display_name AS actor_name FROM procurement_status_history history JOIN users ON users.id = history.actor_id WHERE request_id = $1 ORDER BY history.created_at", [id]),
      ]);
      return { ...request, items: items.rows, comments: comments.rows, history: history.rows };
    },

    async createRequest(input: CreateInput, actorId: string) {
      return withTransaction(pool, async (client) => {
        const total = input.items.reduce((sum, item) => sum + item.quantity * (item.estimatedUnitPrice ?? 0), 0);
        const created = await client.query(`INSERT INTO procurement_requests
          (request_no, requester_id, title, reason, status, total_estimated_amount, submitted_at)
          VALUES ($1, $2, $3, $4, 'submitted', $5, $6) RETURNING id, request_no`, [requestNo(now()), actorId, input.title, input.reason, total, now()]);
        const row = created.rows[0];
        for (const [index, item] of input.items.entries()) await client.query(`INSERT INTO procurement_request_items
          (request_id, item_name, spec, quantity, estimated_unit_price, vendor, url, remark, sort_order)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [row.id, item.itemName, item.spec, item.quantity, item.estimatedUnitPrice ?? null, item.vendor ?? null, item.url ?? null, item.remark ?? null, index]);
        await client.query("INSERT INTO procurement_status_history (request_id, from_status, to_status, actor_id) VALUES ($1, 'draft', 'submitted', $2)", [row.id, actorId]);
        await client.query("INSERT INTO audit_logs (actor_id, action, target_type, target_id, detail) VALUES ($1, 'procurement.create', 'procurement_request', $2, $3)", [actorId, row.id, JSON.stringify({ requestNo: row.request_no })]);
        return { id: row.id, requestNo: row.request_no };
      });
    },

    async transition(id: string, input: TransitionInput, actor: Actor) {
      return withTransaction(pool, async (client) => {
        const locked = await client.query("SELECT id, requester_id, status FROM procurement_requests WHERE id = $1 FOR UPDATE", [id]);
        const request = locked.rows[0];
        if (!request) throw new ProcurementNotFoundError("Procurement request not found");
        if (input.action === "cancel") {
          if (request.requester_id !== actor.id) throw new ProcurementAccessError("Only the requester can cancel this request");
        } else if (!actor.permissions.includes(requiredPermissionForTransition(input.action))) throw new ProcurementAccessError("Permission denied");
        let next: ProcurementStatus;
        try { next = validateTransition(request.status as ProcurementStatus, input.action); }
        catch { throw new ProcurementConflictError("Procurement transition is not allowed"); }
        const timestamps = { approved: "reviewed_at", rejected: "reviewed_at", purchasing: "purchased_at", purchased: "purchased_at", received: "received_at", closed: "closed_at", cancelled: "updated_at" } as const;
        const timestamp = timestamps[next as keyof typeof timestamps];
        await client.query(`UPDATE procurement_requests SET status = $2, updated_at = $3${timestamp ? `, ${timestamp} = $3` : ""}${next === "approved" || next === "rejected" ? ", reviewed_by = $4" : ""}${next === "purchasing" || next === "purchased" ? ", purchased_by = $4" : ""} WHERE id = $1`, [id, next, now(), actor.id]);
        await client.query("INSERT INTO procurement_status_history (request_id, from_status, to_status, actor_id, note) VALUES ($1,$2,$3,$4,$5)", [id, request.status, next, actor.id, input.note || null]);
        await client.query("INSERT INTO audit_logs (actor_id, action, target_type, target_id, detail) VALUES ($1, 'procurement.transition', 'procurement_request', $2, $3)", [actor.id, id, JSON.stringify({ from: request.status, to: next })]);
        return { id, status: next };
      });
    },

    async addComment(id: string, body: string, actor: Actor) {
      const request = await pool.query("SELECT requester_id FROM procurement_requests WHERE id = $1", [id]);
      if (!request.rows[0]) throw new ProcurementNotFoundError("Procurement request not found");
      if (request.rows[0].requester_id !== actor.id && !actor.permissions.includes("procurements.read_all")) throw new ProcurementAccessError("Permission denied");
      const result = await pool.query("INSERT INTO procurement_comments (request_id, author_id, body) VALUES ($1,$2,$3) RETURNING id", [id, actor.id, body]);
      return { id: result.rows[0].id };
    },
  };
}

export type ProcurementService = ReturnType<typeof createProcurementService>;
