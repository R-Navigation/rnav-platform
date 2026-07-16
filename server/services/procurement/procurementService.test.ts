import assert from "node:assert/strict";
import test from "node:test";
import { createProcurementService, ProcurementAccessError, ProcurementConflictError } from "./procurementService.js";

function client(rows: Record<string, unknown>[] = []) {
  const queries: Array<{ sql: string; values?: readonly unknown[] }> = [];
  const value = {
    queries,
    query: async (sql: string, values?: readonly unknown[]) => {
      queries.push({ sql, values });
      if (/RETURNING id,\s*request_no/.test(sql)) return { rows: [{ id: "00000000-0000-4000-8000-000000000099", request_no: "PR-20260712-000001" }], rowCount: 1 };
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
  await assert.rejects(service.listCatalog({ search: "", attributes: {}, includeInactive: true, limit: 100, offset: 0 }, { id: "actor", permissions: ["procurements.create"] }), ProcurementAccessError);
});

test("catalog listing exposes the linked active media URL", async () => {
  const rows = [{ id: "item-1", category_id: "category-1", category_code: "bolts", category_name_zh: "螺栓", sku: "JD-1", name_zh: "螺钉", name_en: "Screw", spec: "M4x10", spec_metadata: {}, unit: "包", pack_size: "1", estimated_unit_price: null, vendor: null, url: null, keywords: [], image_asset_id: "asset-1", image_url: "https://cdn.example/item.jpg", is_active: true, total_count: 1 }];
  const service = createProcurementService({ query: async (sql: string) => sql.includes("FROM procurement_catalog_items") ? { rows, rowCount: 1 } : { rows: [], rowCount: 0 } } as never);
  const result = await service.listCatalog({ search: "", attributes: {}, includeInactive: false, limit: 10, offset: 0 }, { id: "actor", permissions: ["procurements.create"] });
  assert.equal(result.items[0].imageUrl, "https://cdn.example/item.jpg");
});

test("catalog filters bind subcategory and attribute selections as JSONB predicates", async () => {
  const calls: Array<{ sql: string; values?: readonly unknown[] }> = [];
  const service = createProcurementService({ query: async (sql: string, values?: readonly unknown[]) => { calls.push({ sql, values }); return { rows: [], rowCount: 0 }; } } as never);
  await service.listCatalog({ search: "", subcategoryId: "00000000-0000-4000-8000-000000000012", attributes: { thread: ["M3", "M4"], variants: ["黑色"] }, includeInactive: false, limit: 10, offset: 0 }, { id: "actor", permissions: ["procurements.create"] });
  const itemQuery = calls.find((call) => call.sql.includes("count(*) OVER"))!;
  assert.match(itemQuery.sql, /items\.subcategory_id=/);
  assert.match(itemQuery.sql, /jsonb_typeof/);
  assert.ok(itemQuery.values?.includes("thread"));
  assert.ok(itemQuery.values?.some((value) => Array.isArray(value) && value.includes("M3")));
  const facetQuery = calls.find((call) => call.sql.includes("jsonb_agg"))!;
  assert.match(facetQuery.sql, /HAVING count\(flattened\.value\)>0/);
});

test("numeric catalog facets use natural numeric ordering", async () => {
  const service = createProcurementService({ query: async (sql: string) => {
    if (sql.includes("jsonb_agg")) return { rows: [{ id: "attribute-1", subcategory_id: "subcategory-1", attribute_key: "lengthMm", label_zh: "长度", label_en: "Length", unit: "mm", value_type: "number", sort_order: 10, is_filterable: true, values: ["10", "2", "2.5"] }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  } } as never);
  const result = await service.listCatalog({ search: "", subcategoryId: "00000000-0000-4000-8000-000000000012", attributes: {}, includeInactive: false, limit: 10, offset: 0 }, { id: "actor", permissions: ["procurements.create"] });
  assert.deepEqual(result.attributes[0].values, ["2", "2.5", "10"]);
});

test("catalog maintenance requires procurement purchase permission", async () => {
  const service = createProcurementService({ query: async () => ({ rows: [], rowCount: 0 }) } as never);
  await assert.rejects(service.createCatalogCategory({ code: "fasteners", nameZh: "紧固件", nameEn: "", descriptionZh: "", descriptionEn: "", sortOrder: 0, isActive: true }, { id: "actor", permissions: [] }), ProcurementAccessError);
  await assert.rejects(service.deleteCatalogItem("00000000-0000-4000-8000-000000000011", { id: "actor", permissions: [] }), ProcurementAccessError);
});

test("catalog writes are auditable and duplicate codes become stable conflicts", async () => {
  const calls: string[] = [];
  const db = { query: async (sql: string) => { calls.push(sql); return { rows: sql.includes("RETURNING *") ? [{ id: "category-1", code: "bolts", name_zh: "螺栓" }] : [], rowCount: 1 }; }, release() {} };
  const service = createProcurementService({ connect: async () => db } as never);
  await service.createCatalogCategory({ code: "bolts", nameZh: "螺栓", nameEn: "", descriptionZh: "", descriptionEn: "", sortOrder: 0, isActive: true }, { id: "actor", permissions: ["procurements.purchase"] });
  assert.ok(calls.some((sql) => sql.includes("procurement_catalog_subcategories")));
  assert.ok(calls.some((sql) => sql.includes("audit_logs")));
  const duplicateDb = { query: async (sql: string) => { if(sql==="BEGIN"||sql==="ROLLBACK")return { rows: [], rowCount: 0 };throw Object.assign(new Error("duplicate"), { code: "23505" }); }, release() {} };
  const duplicate = createProcurementService({ connect: async () => duplicateDb } as never);
  await assert.rejects(duplicate.createCatalogCategory({ code: "bolts", nameZh: "螺栓", nameEn: "", descriptionZh: "", descriptionEn: "", sortOrder: 0, isActive: true }, { id: "actor", permissions: ["procurements.purchase"] }), ProcurementConflictError);
});

test("catalog item deletion is auditable and preserves request history through the database foreign key", async () => {
  const calls: Array<{ sql: string; values?: readonly unknown[] }> = [];
  const service = createProcurementService({ query: async (sql: string, values?: readonly unknown[]) => {
    calls.push({ sql, values });
    return { rows: [{ id: "00000000-0000-4000-8000-000000000011", sku: "JD-1", name_zh: "标准件" }], rowCount: 1 };
  } } as never);
  const result = await service.deleteCatalogItem("00000000-0000-4000-8000-000000000011", { id: "actor", permissions: ["procurements.purchase"] });
  assert.deepEqual(result, { id: "00000000-0000-4000-8000-000000000011" });
  assert.match(calls[0].sql, /DELETE FROM procurement_catalog_items/);
  assert.match(calls[0].sql, /procurement\.catalog_item\.delete/);
});

test("catalog category deletion rejects non-empty categories", async () => {
  const calls: string[] = [];
  const service = createProcurementService({ query: async (sql: string) => {
    calls.push(sql);
    if (sql.includes("DELETE FROM procurement_catalog_categories")) return { rows: [], rowCount: 0 };
    return { rows: [{ exists: true }], rowCount: 1 };
  } } as never);
  await assert.rejects(
    service.deleteCatalogCategory("00000000-0000-4000-8000-000000000012", { id: "actor", permissions: ["procurements.purchase"] }),
    (error: unknown) => error instanceof ProcurementConflictError && error.message.includes("先删除")
  );
  assert.equal(calls.length, 2);
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

function processingClient(requestStatus: string, itemStatuses: readonly string[] = []) {
  const queries: Array<{ sql: string; values?: readonly unknown[] }> = [];
  return {
    queries,
    async query(sql: string, values?: readonly unknown[]) {
      queries.push({ sql, values });
      if (sql.includes("FROM procurement_requests") && sql.includes("FOR UPDATE")) return { rows: [{ id: "request-1", status: requestStatus }], rowCount: 1 };
      if (sql.includes("SELECT processing_status")) return { rows: itemStatuses.map((processing_status) => ({ processing_status })), rowCount: itemStatuses.length };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
}

test("saving line processing persists progress and moves a submitted request into processing", async () => {
  const db = processingClient("submitted");
  const service = createProcurementService({ connect: async () => db } as never, { now: () => new Date("2026-07-16T08:00:00Z") });
  const result = await service.saveProcessing("00000000-0000-4000-8000-000000000099", { items: [{ itemId: "00000000-0000-4000-8000-000000000011", status: "purchased", rejectionReason: null }] }, { id: "actor", permissions: ["procurements.purchase"] });
  assert.equal(result.status, "purchasing");
  assert.ok(db.queries.some((query) => query.sql.includes("processing_status=$3")));
  assert.ok(db.queries.some((query) => query.sql.includes("status='purchasing'")));
});

test("processing cannot complete while lines are pending", async () => {
  const db = processingClient("purchasing", ["purchased", "pending"]);
  const service = createProcurementService({ connect: async () => db } as never);
  await assert.rejects(service.completeProcessing("00000000-0000-4000-8000-000000000099", { id: "actor", permissions: ["procurements.purchase"] }), ProcurementConflictError);
  assert.equal(db.queries.at(-1)?.sql, "ROLLBACK");
});

test("processing completion orders requests with purchases and closes all-rejected requests", async () => {
  for (const [lineStatuses, expected] of [[["purchased", "rejected"], "purchased"], [["rejected", "rejected"], "closed"]] as const) {
    const db = processingClient("purchasing", lineStatuses);
    const service = createProcurementService({ connect: async () => db } as never);
    const result = await service.completeProcessing("00000000-0000-4000-8000-000000000099", { id: "actor", permissions: ["procurements.purchase"] });
    assert.equal(result.status, expected);
  }
});

test("confirming receipt closes an ordered request", async () => {
  const db = processingClient("purchased");
  const service = createProcurementService({ connect: async () => db } as never);
  const result = await service.confirmReceived("00000000-0000-4000-8000-000000000099", { id: "actor", permissions: ["procurements.purchase"] });
  assert.equal(result.status, "closed");
  assert.ok(db.queries.some((query) => query.sql.includes("received_at=$2")));
});
