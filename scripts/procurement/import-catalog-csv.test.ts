import assert from "node:assert/strict";
import test from "node:test";
import { applyCatalogImport } from "./import-catalog-csv.js";
import type { CatalogImportItem } from "./catalogCsv.js";

const item: CatalogImportItem = { categoryCode: "bolts", sku: "JD-1", nameZh: "螺钉", nameEn: "Screw", spec: "M4x10 · 20个/包", specMetadata: { source: "jd" }, unit: "包", packSize: 1, estimatedUnitPrice: null, vendor: "供应商", url: "https://item.jd.com/1.html", keywords: ["M4"] };

test("catalog import is transactional and preserves manual prices and active state on update", async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const client = { query: async (sql: string, values?: unknown[]) => {
    calls.push({ sql, values });
    if (sql.startsWith("SELECT id, code")) return { rows: [{ id: "category-1", code: "bolts" }], rowCount: 1 };
    if (sql.includes("RETURNING (xmax = 0)")) return { rows: [{ inserted: false }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  } };
  const result = await applyCatalogImport(client as never, [item]);
  assert.deepEqual(result, { inserted: 0, updated: 1, skipped: 0 });
  const upsert = calls.find((call) => call.sql.includes("ON CONFLICT (sku)"))!;
  assert.match(upsert.sql, /COALESCE\(EXCLUDED\.estimated_unit_price, procurement_catalog_items\.estimated_unit_price\)/);
  assert.doesNotMatch(upsert.sql, /is_active\s*=\s*EXCLUDED/i);
  assert.ok(calls.some((call) => call.sql.includes("procurement.catalog.bulk_import")));
  assert.equal(calls.at(-1)?.sql, "COMMIT");
});

test("missing-only catalog import never updates an existing SKU", async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const client = { query: async (sql: string, values?: unknown[]) => {
    calls.push({ sql, values });
    if (sql.startsWith("SELECT id, code")) return { rows: [{ id: "category-1", code: "bolts" }], rowCount: 1 };
    if (sql.includes("RETURNING (xmax = 0)")) return { rows: [], rowCount: 0 };
    return { rows: [], rowCount: 0 };
  } };
  const result = await applyCatalogImport(client as never, [item], { insertMissingOnly: true });
  assert.deepEqual(result, { inserted: 0, updated: 0, skipped: 1 });
  const insert = calls.find((call) => call.sql.includes("ON CONFLICT (sku)"))!;
  assert.match(insert.sql, /ON CONFLICT \(sku\) DO NOTHING/);
  assert.doesNotMatch(insert.sql, /DO UPDATE SET/);
});

test("catalog import refuses unknown target categories before opening a transaction", async () => {
  const calls: string[] = [];
  const client = { query: async (sql: string) => { calls.push(sql); return { rows: [], rowCount: 0 }; } };
  await assert.rejects(applyCatalogImport(client as never, [item]), /Missing catalog categories/);
  assert.deepEqual(calls, ["SELECT id, code FROM procurement_catalog_categories WHERE code = ANY($1::text[])"]);
});
