import assert from "node:assert/strict";
import test from "node:test";
import { createProcurementService, ProcurementAccessError, ProcurementConflictError } from "./procurementService.js";

function client(rows: Record<string, unknown>[] = []) {
  const queries: Array<{ sql: string; values?: readonly unknown[] }> = [];
  const value = {
    queries,
    query: async (sql: string, values?: readonly unknown[]) => {
      queries.push({ sql, values });
      if (sql.includes("RETURNING id, request_no")) return { rows: [{ id: "00000000-0000-4000-8000-000000000099", request_no: "PR-20260712-0001" }], rowCount: 1 };
      if (sql.includes("FOR UPDATE")) return { rows, rowCount: rows.length };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  return value;
}

test("creating a submitted request persists items, history, and audit atomically", async () => {
  const db = client();
  const service = createProcurementService({ connect: async () => db } as never, { now: () => new Date("2026-07-12T08:00:00Z") });
  const result = await service.createRequest({ title: "相机", reason: "实验", items: [{ itemName: "D455", spec: "", quantity: 2, estimatedUnitPrice: 1500 }] }, "00000000-0000-4000-8000-000000000001");
  assert.equal(result.requestNo, "PR-20260712-0001");
  assert.ok(db.queries.some((query) => query.sql.includes("procurement_request_items")));
  assert.ok(db.queries.some((query) => query.sql.includes("procurement_status_history")));
  assert.ok(db.queries.some((query) => query.sql.includes("audit_logs")));
  assert.equal(db.queries.at(-1)?.sql, "COMMIT");
});

test("a requester cannot cancel another member's submitted request", async () => {
  const db = client([{ id: "request-1", requester_id: "other-user", status: "submitted" }]);
  const service = createProcurementService({ connect: async () => db } as never);
  await assert.rejects(service.transition("00000000-0000-4000-8000-000000000099", { action: "cancel", note: "" }, { id: "actor", permissions: ["procurements.read_own"] }), ProcurementAccessError);
  assert.equal(db.queries.at(-1)?.sql, "ROLLBACK");
});

test("invalid current state rolls back without status history", async () => {
  const db = client([{ id: "request-1", requester_id: "actor", status: "closed" }]);
  const service = createProcurementService({ connect: async () => db } as never);
  await assert.rejects(service.transition("00000000-0000-4000-8000-000000000099", { action: "approve", note: "" }, { id: "actor", permissions: ["procurements.review"] }), ProcurementConflictError);
  assert.equal(db.queries.filter((query) => query.sql.includes("procurement_status_history")).length, 0);
});
