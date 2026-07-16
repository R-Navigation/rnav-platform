import type { Pool, PoolClient } from "pg";
import type { z } from "zod";
import type { catalogCategorySchema, catalogItemSchema, catalogQuerySchema, createProcurementSchema, transitionSchema } from "./schemas.js";
import { requiredPermissionForTransition, validateTransition, type ProcurementStatus } from "./workflow.js";

type CreateInput = z.input<typeof createProcurementSchema>;
type TransitionInput = z.output<typeof transitionSchema>;
type CatalogQuery = z.output<typeof catalogQuerySchema>;
type CatalogCategoryInput = z.output<typeof catalogCategorySchema>;
type CatalogItemInput = z.output<typeof catalogItemSchema>;
type Actor = { id: string; permissions: string[] };
type Dependencies = { now?: () => Date };

export class ProcurementNotFoundError extends Error {}
export class ProcurementAccessError extends Error {}
export class ProcurementConflictError extends Error {}

function mapCatalogWriteError(error: unknown): never {
  if (error && typeof error === "object" && (error as { code?: unknown }).code === "23505") throw new ProcurementConflictError("Catalog code or SKU already exists");
  if (error && typeof error === "object" && (error as { code?: unknown }).code === "23503") throw new ProcurementConflictError("Catalog category or media asset is unavailable");
  throw error;
}

function requireCatalogManager(actor: Actor) {
  if (!actor.permissions.includes("procurements.purchase")) throw new ProcurementAccessError("Permission denied");
}

function mapCategory(row: Record<string, unknown>) {
  return { id: row.id, code: row.code, nameZh: row.name_zh, nameEn: row.name_en, descriptionZh: row.description_zh, descriptionEn: row.description_en, sortOrder: row.sort_order, isActive: row.is_active };
}

function mapCatalogItem(row: Record<string, unknown>) {
  return {
    id: row.id, categoryId: row.category_id, categoryCode: row.category_code, categoryNameZh: row.category_name_zh,
    sku: row.sku, nameZh: row.name_zh, nameEn: row.name_en, spec: row.spec, specMetadata: row.spec_metadata,
    unit: row.unit, packSize: Number(row.pack_size), estimatedUnitPrice: row.estimated_unit_price === null ? null : Number(row.estimated_unit_price),
    vendor: row.vendor, url: row.url, keywords: row.keywords, imageAssetId: row.image_asset_id, isActive: row.is_active,
  };
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
    async listCatalog(query: CatalogQuery, actor: Actor) {
      if (query.includeInactive) requireCatalogManager(actor);
      const values: unknown[] = [];
      const where: string[] = [];
      if (!query.includeInactive) where.push("categories.is_active = true", "items.is_active = true");
      if (query.categoryId) { values.push(query.categoryId); where.push(`items.category_id = $${values.length}`); }
      if (query.search) {
        values.push(`%${query.search}%`);
        where.push(`(items.name_zh ILIKE $${values.length} OR items.name_en ILIKE $${values.length} OR items.spec ILIKE $${values.length} OR COALESCE(items.sku, '') ILIKE $${values.length} OR array_to_string(items.keywords, ' ') ILIKE $${values.length})`);
      }
      const [categories, items] = await Promise.all([
        pool.query(`SELECT * FROM procurement_catalog_categories ${query.includeInactive ? "" : "WHERE is_active = true"} ORDER BY sort_order, name_zh`),
        pool.query(`SELECT items.*, categories.code AS category_code, categories.name_zh AS category_name_zh
          FROM procurement_catalog_items items JOIN procurement_catalog_categories categories ON categories.id = items.category_id
          ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
          ORDER BY categories.sort_order, items.name_zh, items.spec, items.sku`, values),
      ]);
      return { categories: categories.rows.map(mapCategory), items: items.rows.map(mapCatalogItem) };
    },

    async createCatalogCategory(input: CatalogCategoryInput, actor: Actor) {
      requireCatalogManager(actor);
      try {
        const result = await pool.query(`WITH created AS (
          INSERT INTO procurement_catalog_categories (code, name_zh, name_en, description_zh, description_en, sort_order, is_active)
          VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
        ), audited AS (
          INSERT INTO audit_logs (actor_id, action, target_type, target_id, detail)
          SELECT $8, 'procurement.catalog_category.create', 'procurement_catalog_category', id, jsonb_build_object('code', code) FROM created
        ) SELECT * FROM created`, [input.code, input.nameZh, input.nameEn, input.descriptionZh, input.descriptionEn, input.sortOrder, input.isActive, actor.id]);
        return mapCategory(result.rows[0]);
      } catch (error) { mapCatalogWriteError(error); }
    },

    async updateCatalogCategory(id: string, input: CatalogCategoryInput, actor: Actor) {
      requireCatalogManager(actor);
      try {
        const result = await pool.query(`WITH updated AS (
          UPDATE procurement_catalog_categories SET code=$2, name_zh=$3, name_en=$4, description_zh=$5, description_en=$6, sort_order=$7, is_active=$8, updated_at=$9
          WHERE id=$1 RETURNING *
        ), audited AS (
          INSERT INTO audit_logs (actor_id, action, target_type, target_id, detail)
          SELECT $10, 'procurement.catalog_category.update', 'procurement_catalog_category', id, jsonb_build_object('code', code, 'isActive', is_active) FROM updated
        ) SELECT * FROM updated`, [id, input.code, input.nameZh, input.nameEn, input.descriptionZh, input.descriptionEn, input.sortOrder, input.isActive, now(), actor.id]);
        if (!result.rows[0]) throw new ProcurementNotFoundError("Catalog category not found");
        return mapCategory(result.rows[0]);
      } catch (error) { if (error instanceof ProcurementNotFoundError) throw error; mapCatalogWriteError(error); }
    },

    async createCatalogItem(input: CatalogItemInput, actor: Actor) {
      requireCatalogManager(actor);
      try {
        const result = await pool.query(`WITH created AS (
          INSERT INTO procurement_catalog_items (category_id, sku, name_zh, name_en, spec, spec_metadata, unit, pack_size, estimated_unit_price, vendor, url, keywords, image_asset_id, is_active)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *
        ), audited AS (
          INSERT INTO audit_logs (actor_id, action, target_type, target_id, detail)
          SELECT $15, 'procurement.catalog_item.create', 'procurement_catalog_item', id, jsonb_build_object('sku', sku, 'nameZh', name_zh) FROM created
        ) SELECT * FROM created`, [input.categoryId, input.sku || null, input.nameZh, input.nameEn, input.spec, input.specMetadata, input.unit, input.packSize, input.estimatedUnitPrice ?? null, input.vendor ?? null, input.url ?? null, input.keywords, input.imageAssetId ?? null, input.isActive, actor.id]);
        return mapCatalogItem(result.rows[0]);
      } catch (error) { mapCatalogWriteError(error); }
    },

    async updateCatalogItem(id: string, input: CatalogItemInput, actor: Actor) {
      requireCatalogManager(actor);
      try {
        const result = await pool.query(`WITH updated AS (
          UPDATE procurement_catalog_items SET category_id=$2, sku=$3, name_zh=$4, name_en=$5, spec=$6, spec_metadata=$7, unit=$8, pack_size=$9,
          estimated_unit_price=$10, vendor=$11, url=$12, keywords=$13, image_asset_id=$14, is_active=$15, updated_at=$16
          WHERE id=$1 RETURNING *
        ), audited AS (
          INSERT INTO audit_logs (actor_id, action, target_type, target_id, detail)
          SELECT $17, 'procurement.catalog_item.update', 'procurement_catalog_item', id, jsonb_build_object('sku', sku, 'nameZh', name_zh, 'isActive', is_active) FROM updated
        ) SELECT * FROM updated`, [id, input.categoryId, input.sku || null, input.nameZh, input.nameEn, input.spec, input.specMetadata, input.unit, input.packSize, input.estimatedUnitPrice ?? null, input.vendor ?? null, input.url ?? null, input.keywords, input.imageAssetId ?? null, input.isActive, now(), actor.id]);
        if (!result.rows[0]) throw new ProcurementNotFoundError("Catalog item not found");
        return mapCatalogItem(result.rows[0]);
      } catch (error) { if (error instanceof ProcurementNotFoundError) throw error; mapCatalogWriteError(error); }
    },

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
        const resolvedItems = [] as Array<{ catalogItemId: string | null; itemName: string; spec: string; unit: string; quantity: number; estimatedUnitPrice: number | null; vendor: string | null; url: string | null; remark: string | null; sourceType: "catalog" | "custom"; snapshot: Record<string, unknown> }>;
        for (const item of input.items) {
          if (item.sourceType === "catalog") {
            const result = await client.query(`SELECT items.*, categories.code AS category_code, categories.name_zh AS category_name_zh
              FROM procurement_catalog_items items JOIN procurement_catalog_categories categories ON categories.id = items.category_id
              WHERE items.id = $1 AND items.is_active = true AND categories.is_active = true FOR SHARE OF items, categories`, [item.catalogItemId]);
            const catalog = result.rows[0];
            if (!catalog) throw new ProcurementConflictError("Catalog item is unavailable");
            const price = catalog.estimated_unit_price === null ? null : Number(catalog.estimated_unit_price);
            resolvedItems.push({
              catalogItemId: catalog.id, itemName: catalog.name_zh, spec: catalog.spec, unit: catalog.unit,
              quantity: item.quantity, estimatedUnitPrice: price, vendor: catalog.vendor, url: catalog.url,
              remark: item.remark ?? null, sourceType: "catalog",
              snapshot: { id: catalog.id, sku: catalog.sku, categoryCode: catalog.category_code, categoryNameZh: catalog.category_name_zh, nameZh: catalog.name_zh, nameEn: catalog.name_en, spec: catalog.spec, specMetadata: catalog.spec_metadata, unit: catalog.unit, packSize: Number(catalog.pack_size), estimatedUnitPrice: price, vendor: catalog.vendor, url: catalog.url },
            });
          } else {
            resolvedItems.push({ catalogItemId: null, itemName: item.itemName, spec: item.spec ?? "", unit: item.unit ?? "件", quantity: item.quantity, estimatedUnitPrice: item.estimatedUnitPrice ?? null, vendor: item.vendor ?? null, url: item.url ?? null, remark: item.remark ?? null, sourceType: "custom", snapshot: {} });
          }
        }
        const total = resolvedItems.reduce((sum, item) => sum + Math.round(item.quantity * (item.estimatedUnitPrice ?? 0) * 100), 0) / 100;
        if (total > 9_999_999_999.99) throw new ProcurementConflictError("Total estimated amount exceeds database range");
        const created = await client.query(`INSERT INTO procurement_requests
          (request_no, requester_id, title, reason, status, total_estimated_amount, submitted_at)
          VALUES ('PR-' || to_char($1::timestamptz, 'YYYYMMDD') || '-' || lpad(nextval('procurement_request_no_seq')::text, 6, '0'), $2, $3, $4, 'submitted', $5, $1) RETURNING id, request_no`, [now(), actorId, input.title, input.reason, total]);
        const row = created.rows[0];
        for (const [index, item] of resolvedItems.entries()) await client.query(`INSERT INTO procurement_request_items
          (request_id, catalog_item_id, item_name, spec, quantity, estimated_unit_price, vendor, url, remark, sort_order, source_type, catalog_snapshot, unit)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [row.id, item.catalogItemId, item.itemName, item.spec, item.quantity, item.estimatedUnitPrice, item.vendor, item.url, item.remark, index, item.sourceType, JSON.stringify(item.snapshot), item.unit]);
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
        } else {
          if (request.requester_id === actor.id && (input.action === "approve" || input.action === "reject")) throw new ProcurementAccessError("Requesters cannot review their own request");
          if (!actor.permissions.includes(requiredPermissionForTransition(input.action))) throw new ProcurementAccessError("Permission denied");
        }
        let next: ProcurementStatus;
        try { next = validateTransition(request.status as ProcurementStatus, input.action); }
        catch { throw new ProcurementConflictError("Procurement transition is not allowed"); }
        const timestamps = { approved: "reviewed_at", rejected: "reviewed_at", purchased: "purchased_at", received: "received_at", closed: "closed_at" } as const;
        const timestamp = timestamps[next as keyof typeof timestamps];
        const actorColumn = next === "approved" || next === "rejected" ? "reviewed_by" : next === "purchasing" || next === "purchased" ? "purchased_by" : null;
        const values: unknown[] = [id, next, now()];
        if (actorColumn) values.push(actor.id);
        await client.query(`UPDATE procurement_requests SET status = $2, updated_at = $3${timestamp ? `, ${timestamp} = $3` : ""}${actorColumn ? `, ${actorColumn} = $4` : ""} WHERE id = $1`, values);
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
