import assert from "node:assert/strict";
import test from "node:test";
import { createProcurementService, ProcurementAccessError, ProcurementConflictError } from "./procurementService.js";

function client(rows: Record<string, unknown>[] = []) {
  const queries: Array<{ sql: string; values?: readonly unknown[] }> = [];
  const value = {
    queries,
    query: async (sql: string, values?: readonly unknown[]) => {
      queries.push({ sql, values });
      if (sql.includes("RETURNING id, request_no")) return { rows: [{ id: "00000000-0000-4000-8000-000000000099", request_no: "PR-20260712-000001" }], rowCount: 1 };
      if (sql.includes("FROM procurement_catalog_items") && sql.includes("FOR SHARE")) return { rows, rowCount: rows.length };
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
  assert.equal(result.requestNo, "PR-20260712-000001");
  assert.ok(db.queries.some((query) => query.sql.includes("procurement_request_items")));
  assert.ok(db.queries.some((query) => query.sql.includes("procurement_status_history")));
  assert.ok(db.queries.some((query) => query.sql.includes("audit_logs")));
  assert.equal(db.queries.at(-1)?.sql, "COMMIT");
});

test("catalog items are resolved by the server and persisted with an immutable snapshot", async () => {
  const db = client([{
    id: "00000000-0000-4000-8000-000000000011",
    sku: "BOLT-M6X20",
    name_zh: "内六角圆柱头螺钉",
    name_en: "Socket head cap screw",
    spec: "M6x20",
    unit: "个",
    pack_size: 1,
    estimated_unit_price: "0.80",
    vendor: "标准件供应商",
    url: null,
    category_code: "bolts",
    category_name_zh: "螺栓",
  }]);
  const service = createProcurementService({ connect: async () => db } as never, { now: () => new Date("2026-07-12T08:00:00Z") });
  await service.createRequest({
    title: "紧固件",
    reason: "装配",
    items: [{ sourceType: "catalog", catalogItemId: "00000000-0000-4000-8000-000000000011", quantity: 10, remark: null }],
  }, "00000000-0000-4000-8000-000000000001");
  const insert = db.queries.find((query) => query.sql.includes("INSERT INTO procurement_request_items"))!;
  assert.match(insert.sql, /catalog_snapshot/);
  assert.equal(insert.values?.[2], "内六角圆柱头螺钉");
  assert.equal(insert.values?.[5], 0.8);
  assert.match(String(insert.values?.[11]), /BOLT-M6X20/);
});

test("inactive or missing catalog items abort the whole request", async () => {
  const db = client([]);
  const service = createProcurementService({ connect: async () => db } as never);
  await assert.rejects(service.createRequest({
    title: "紧固件",
    reason: "装配",
    items: [{ sourceType: "catalog", catalogItemId: "00000000-0000-4000-8000-000000000011", quantity: 10 }],
  }, "00000000-0000-4000-8000-000000000001"), ProcurementConflictError);
  assert.equal(db.queries.at(-1)?.sql, "ROLLBACK");
});

test("server resolved catalog totals cannot overflow the request amount", async () => {
  const db = client([{ id: "00000000-0000-4000-8000-000000000011", sku: "EXPENSIVE", name_zh: "昂贵标准件", name_en: "", spec: "", unit: "件", pack_size: 1, estimated_unit_price: "9999999.99", vendor: null, url: null, category_code: "other-standard", category_name_zh: "其他标准件" }]);
  const service = createProcurementService({ connect: async () => db } as never);
  await assert.rejects(service.createRequest({ title: "大额申请", reason: "测试", items: [{ sourceType: "catalog", catalogItemId: "00000000-0000-4000-8000-000000000011", quantity: 1_000_000 }] }, "00000000-0000-4000-8000-000000000001"), ProcurementConflictError);
  assert.equal(db.queries.at(-1)?.sql, "ROLLBACK");
});

test("inactive catalog visibility requires purchase permission", async () => {
  const service = createProcurementService({ query: async () => ({ rows: [], rowCount: 0 }) } as never);
  await assert.rejects(service.listCatalog({ search: "", includeInactive: true, limit: 100, offset: 0 }, { id: "actor", permissions: ["procurements.create"] }), ProcurementAccessError);
});

test("catalog maintenance requires procurement purchase permission", async () => {
  const service = createProcurementService({ query: async () => ({ rows: [], rowCount: 0 }) } as never);
  await assert.rejects(service.createCatalogCategory({ code: "fasteners", nameZh: "紧固件", nameEn: "", descriptionZh: "", descriptionEn: "", sortOrder: 0, isActive: true }, { id: "actor", permissions: [] }), ProcurementAccessError);
});

test("catalog writes are auditable and duplicate codes become stable conflicts", async () => {
  const calls: string[] = [];
  const service = createProcurementService({ query: async (sql: string) => { calls.push(sql); return { rows: [{ id: "category-1", code: "bolts", name_zh: "螺栓" }], rowCount: 1 }; } } as never);
  await service.createCatalogCategory({ code: "bolts", nameZh: "螺栓", nameEn: "", descriptionZh: "", descriptionEn: "", sortOrder: 0, isActive: true }, { id: "actor", permissions: ["procurements.purchase"] });
  assert.match(calls[0], /audit_logs/);
  const duplicate = createProcurementService({ query: async () => { throw Object.assign(new Error("duplicate"), { code: "23505" }); } } as never);
  await assert.rejects(duplicate.createCatalogCategory({ code: "bolts", nameZh: "螺栓", nameEn: "", descriptionZh: "", descriptionEn: "", sortOrder: 0, isActive: true }, { id: "actor", permissions: ["procurements.purchase"] }), ProcurementConflictError);
});

test("a requester cannot cancel another member's submitted request", async () => {
  const db = client([{ id: "request-1", requester_id: "other-user", status: "submitted" }]);
  const service = createProcurementService({ connect: async () => db } as never);
  await assert.rejects(service.transition("00000000-0000-4000-8000-000000000099", { action: "cancel", note: "" }, { id: "actor", permissions: ["procurements.read_own"] }), ProcurementAccessError);
  assert.equal(db.queries.at(-1)?.sql, "ROLLBACK");
});

test("invalid current state rolls back without status history", async () => {
  const db = client([{ id: "request-1", requester_id: "other", status: "closed" }]);
  const service = createProcurementService({ connect: async () => db } as never);
  await assert.rejects(service.transition("00000000-0000-4000-8000-000000000099", { action: "approve", note: "" }, { id: "actor", permissions: ["procurements.review"] }), ProcurementConflictError);
  assert.equal(db.queries.filter((query) => query.sql.includes("procurement_status_history")).length, 0);
});

test("reviewers cannot approve their own request", async () => {
  const db = client([{ id: "request-1", requester_id: "actor", status: "submitted" }]);
  const service = createProcurementService({ connect: async () => db } as never);
  await assert.rejects(service.transition("00000000-0000-4000-8000-000000000099", { action: "approve", note: "" }, { id: "actor", permissions: ["procurements.review"] }), ProcurementAccessError);
});

test("transition updates bind exactly the placeholders used by each status", async () => {
  for (const [status, action] of [["purchased", "mark_received"], ["received", "close"], ["submitted", "cancel"]] as const) {
    const db = client([{ id: "request-1", requester_id: "actor", status }]);
    const service = createProcurementService({ connect: async () => db } as never);
    await service.transition("00000000-0000-4000-8000-000000000099", { action, note: "" }, { id: "actor", permissions: ["procurements.purchase", "procurements.close"] });
    const update = db.queries.find((query) => query.sql.startsWith("UPDATE procurement_requests"))!;
    const placeholders = [...update.sql.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]));
    assert.equal(Math.max(...placeholders), update.values?.length);
  }
});
