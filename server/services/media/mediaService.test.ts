import assert from "node:assert/strict";
import test from "node:test";
import { createMediaService, MediaError } from "./mediaService.js";

class Client {
  calls: Array<{ sql: string; values?: unknown[] }> = [];
  released = false;
  referenceCount = "0";
  async query<T = Record<string, unknown>>(sql: string, values?: unknown[]) {
    this.calls.push({ sql, values });
    if (sql.includes("SELECT (")) return { rowCount: 1, rows: [{ count: this.referenceCount }] } as any;
    if (sql.includes("FROM media_assets") && sql.includes("FOR UPDATE")) return { rowCount: 1, rows: [{ id: "asset-1", object_key: "rnav/a.png", filename: "a.png", status: "recycled", recycled_at: "2020-01-01", size_bytes: "3", mime_type: "image/png", checksum_sha256: "x", url: "https://x/a.png", created_at: "2020-01-01" }] } as any;
    if (sql.includes("INSERT INTO media_assets")) return { rowCount: 1, rows: [{ id: "asset-1", object_key: "rnav/a.png", filename: "a.png", status: "active", size_bytes: "3", mime_type: "image/png", checksum_sha256: "x", url: "https://x/a.png", created_at: "2020-01-01", recycled_at: null }] } as any;
    return { rowCount: 1, rows: [] } as any;
  }
  release() { this.released = true; }
}

class Cos {
  puts: string[] = [];
  deletes: string[] = [];
  failDelete = false;
  async putObject(input: { key: string }) { this.puts.push(input.key); }
  async deleteObject(key: string) { this.deletes.push(key); if (this.failDelete) throw new Error("cos unavailable"); }
}

test("upload validates input, stores one object, and writes an auditable asset", async () => {
  const client = new Client(); const cos = new Cos();
  const service = createMediaService({ connect: async () => client } as never, cos);
  const result = await service.upload({ filename: "a.png", mimeType: "image/png", body: Buffer.from("abc"), maxBytes: 20, publicBaseUrl: "https://cdn.example", pathPrefix: "rnav" }, "user-1");
  assert.equal(result.mimeType, "image/png"); assert.equal(cos.puts.length, 1); assert.ok(client.calls.some(call => call.sql.includes("media.upload"))); assert.equal(client.calls.at(-1)?.sql, "COMMIT");
});

test("media reference counts include procurement catalog images", async () => {
  const client = new Client(); const service = createMediaService({ query: async (sql: string, values?: unknown[]) => client.query(sql, values) } as never, new Cos());
  await service.getReferences("asset-1");
  assert.ok(client.calls.some((call) => call.sql.includes("procurement_catalog_items WHERE image_asset_id=$1")));
});

test("recycle refuses referenced assets and permanent deletion requires the retention period", async () => {
  const client = new Client(); const service = createMediaService({ connect: async () => client } as never, new Cos()); client.referenceCount = "1";
  await assert.rejects(service.recycle("asset-1", "user-1"), (error: unknown) => error instanceof MediaError && error.code === "MEDIA_REFERENCED");
  client.referenceCount = "0";
  const cos = new Cos(); const deleting = createMediaService({ connect: async () => client, query: async (sql: string, values?: unknown[]) => { client.calls.push({ sql, values }); return { rows: [] }; } } as never, cos);
  await deleting.permanentDelete("asset-1", "user-1");
  assert.deepEqual(cos.deletes, ["rnav/a.png"]);
});

test("permanent deletion preserves a recycled row when COS deletion fails", async () => {
  const client = new Client(); const cos = new Cos(); cos.failDelete = true;
  const service = createMediaService({ connect: async () => client, query: async (sql: string, values?: unknown[]) => { client.calls.push({ sql, values }); return { rows: [] }; } } as never, cos);
  await assert.rejects(service.permanentDelete("asset-1", "user-1"), (error: unknown) => error instanceof MediaError && error.code === "MEDIA_DELETE_FAILED");
  assert.ok(client.calls.some(call => call.sql.includes("delete_error")));
});
