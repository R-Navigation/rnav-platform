import assert from "node:assert/strict";
import test from "node:test";
import { replaceResearchItemCollection } from "./researchItemRepository.js";

test("research collection persistence is ID-based and never deletes the whole table", async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const client = { async query(sql: string, values?: unknown[]) {
    calls.push({ sql, values });
    if (sql.includes("SELECT id FROM research_items")) return { rows: [{ id: "kept" }, { id: "removed" }], rowCount: 2 };
    if (sql.includes("FROM scholarly_works") && sql.includes("research_item_id=$1")) return { rows: [], rowCount: 0 };
    return { rows: [], rowCount: 1 };
  } };
  await replaceResearchItemCollection(client as never, [{ id: "kept", title: { en: "Title" }, authors: [], keywords: [], links: [] }], "actor");
  assert.ok(calls.some((call) => /ON CONFLICT \(id\) DO UPDATE/.test(call.sql)));
  assert.ok(calls.some((call) => /DELETE FROM research_items WHERE id=ANY/.test(call.sql)));
  assert.equal(calls.some((call) => /^DELETE FROM research_items\s*$/i.test(call.sql.trim())), false);
  assert.ok(calls.some((call) => /decision='ignored'/.test(call.sql)));
});
