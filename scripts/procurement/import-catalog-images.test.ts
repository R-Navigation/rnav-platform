import assert from "node:assert/strict";
import test from "node:test";
import { applyCatalogImages, normalizeCosPublicBaseUrl } from "./import-catalog-images.js";

test("catalog image import normalizes the legacy Tencent COS public hostname", () => {
  assert.equal(normalizeCosPublicBaseUrl("https://bucket.cos-ap-beijing.myqcloud.com/"), "https://bucket.cos.ap-beijing.myqcloud.com");
  assert.equal(normalizeCosPublicBaseUrl("https://media.example.com/"), "https://media.example.com");
});

test("catalog image import uploads one shared image and links every matching option", async () => {
  const calls: Array<{ sql: string; values?: readonly unknown[] }> = [];
  const client = { query: async (sql: string, values?: readonly unknown[]) => {
    calls.push({ sql, values });
    if (sql.includes("GROUP BY")) return { rows: [{ source_sku: "1001", count: 12 }], rowCount: 1 };
    if (sql.startsWith("SELECT id,object_key") || sql.startsWith("SELECT DISTINCT image_asset_id")) return { rows: [], rowCount: 0 };
    if (sql.includes("INSERT INTO media_assets")) return { rows: [{ id: "asset-1", object_key: "key", url: "url", checksum_sha256: "hash" }], rowCount: 1 };
    if (sql.startsWith("UPDATE procurement_catalog_items")) return { rows: [], rowCount: 12 };
    return { rows: [], rowCount: 1 };
  } };
  const puts: string[] = [];
  const result = await applyCatalogImages(client as never, { put: async (key) => { puts.push(key); }, delete: async () => {} }, [{ sourceSku: "1001", path: "/tmp/1001.jpg", filename: "1001.jpg", mimeType: "image/jpeg", body: Buffer.from("image"), checksum: "a".repeat(64) }], { publicBaseUrl: "https://cdn.example", pathPrefix: "rnav" });
  assert.equal(puts.length, 1); assert.equal(result[0].itemsMatched, 12); assert.equal(result[0].itemsUpdated, 12); assert.match(puts[0], /procurement\/catalog\/1001-/); assert.equal(calls.at(-1)?.sql, "COMMIT");
});

test("catalog image import refuses images with no matching catalog product", async () => {
  const calls: string[] = [];
  const client = { query: async (sql: string) => { calls.push(sql); return { rows: [], rowCount: 0 }; } };
  await assert.rejects(applyCatalogImages(client as never, { put: async () => {}, delete: async () => {} }, [{ sourceSku: "missing", path: "x", filename: "missing.jpg", mimeType: "image/jpeg", body: Buffer.from("x"), checksum: "b".repeat(64) }], { publicBaseUrl: "https://cdn.example", pathPrefix: "rnav" }), /No catalog items found/);
  assert.equal(calls.length, 1);
});
