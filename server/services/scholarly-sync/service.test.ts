import assert from "node:assert/strict";
import test from "node:test";
import { createScholarlySyncService } from "./service.js";

const normalized = { openalexWorkId: "W1", doi: "10.1/example", doiUrl: "https://doi.org/10.1/example", title: "Safe work", year: 2026, venue: "Test Venue", providerType: "article", mappedType: "journal", authors: [], arxivUrl: null, landingPageUrl: null, providerUpdatedAt: null };

function testService() {
  const states = new Map([["safe", { decision: "pending", researchItemId: null as string | null }], ["duplicate", { decision: "pending", researchItemId: null as string | null }], ["merge", { decision: "pending", researchItemId: null as string | null }]]);
  const client = {
    async query(sql: string, values: unknown[] = []) {
      if (sql.startsWith("SELECT * FROM scholarly_works")) { const state = states.get(String(values[0])); return { rows: state ? [{ decision: state.decision, research_item_id: state.researchItemId, source_snapshot: { normalized } }] : [], rowCount: state ? 1 : 0 }; }
      if (sql.startsWith("SELECT decision,research_item_id")) { const state = states.get(String(values[0])); return { rows: state ? [{ decision: state.decision, research_item_id: state.researchItemId }] : [], rowCount: state ? 1 : 0 }; }
      if (sql.startsWith("SELECT COALESCE(max(sort_order)")) return { rows: [{ sort_order: 0 }], rowCount: 1 };
      if (sql.includes("SELECT id FROM research_items WHERE id=$1 FOR UPDATE")) return { rows: [{ id: values[0] }], rowCount: 1 };
      if (sql.startsWith("SELECT id FROM research_items WHERE id")) return { rows: [], rowCount: 0 };
      if (sql.startsWith("UPDATE scholarly_works SET decision='accepted'")) { const state = states.get(String(values[0])); if (state) { state.decision = "accepted"; state.researchItemId = String(values[1]); } return { rows: [{ id: values[0] }], rowCount: state ? 1 : 0 }; }
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const repository = {
    async getWorksByIds(ids: string[]) { return ids.map((id) => ({ id, decision: states.get(id)?.decision, sourceSnapshot: { normalized }, duplicateSuggestion: id === "duplicate" ? { researchItemId: "paper-existing", confidence: "high" } : null })); },
  };
  const pool = { query: client.query.bind(client), connect: async () => client };
  return { states, service: createScholarlySyncService({ pool: pool as never, repository: repository as never, openAlex: {} as never, crossref: {} as never, enabled: true, providerConfig: { openAlexKeyConfigured: false, crossrefContactConfigured: false } }) };
}

test("bulk accept skips duplicate suggestions and retries accepted works idempotently", async () => {
  const { service } = testService();
  const first = await service.bulkAccept(["safe", "duplicate"], "actor");
  assert.equal(first.accepted, 1); assert.equal(first.skipped, 1);
  const retry = await service.bulkAccept(["safe"], "actor");
  assert.equal(retry.alreadyAccepted, 1); assert.equal(retry.failed, 0);
});

test("bulk merge is per-item and retry-safe", async () => {
  const { service } = testService();
  const first = await service.bulkMerge([{ workId: "merge", researchItemId: "paper-existing" }], "actor");
  assert.equal(first.merged, 1);
  const retry = await service.bulkMerge([{ workId: "merge", researchItemId: "paper-existing" }], "actor");
  assert.equal(retry.alreadyMerged, 1); assert.equal(retry.failed, 0);
});
