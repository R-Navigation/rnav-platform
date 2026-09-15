import assert from "node:assert/strict";
import test from "node:test";
import { createScholarlySyncService } from "./service.js";

const normalized = { openalexWorkId: "W1", doi: "10.1/example", doiUrl: "https://doi.org/10.1/example", title: "Safe work", year: 2026, venue: "Test Venue", providerType: "article", mappedType: "journal", authors: [], arxivUrl: null, landingPageUrl: null, providerUpdatedAt: null };

function testService(existingTargetRegistry = false) {
  const states = new Map([["safe", { decision: "pending", researchItemId: null as string | null, mergedInto: null as string | null }], ["duplicate", { decision: "pending", researchItemId: null as string | null, mergedInto: null as string | null }], ["merge", { decision: "pending", researchItemId: null as string | null, mergedInto: null as string | null }]]);
  const client = {
    async query(sql: string, values: unknown[] = []) {
      if (sql.startsWith("SELECT * FROM scholarly_works")) { const state = states.get(String(values[0])); return { rows: state ? [{ decision: state.decision, research_item_id: state.researchItemId, source_snapshot: { normalized } }] : [], rowCount: state ? 1 : 0 }; }
      if (sql.startsWith("SELECT decision,research_item_id")) { const state = states.get(String(values[0])); return { rows: state ? [{ decision: state.decision, research_item_id: state.researchItemId, source_snapshot: state.mergedInto ? { mergedIntoResearchItemId: state.mergedInto } : {} }] : [], rowCount: state ? 1 : 0 }; }
      if (sql.startsWith("SELECT COALESCE(max(sort_order)")) return { rows: [{ sort_order: 0 }], rowCount: 1 };
      if (sql.includes("SELECT id FROM research_items WHERE id=$1 FOR UPDATE")) return { rows: [{ id: values[0] }], rowCount: 1 };
      if (sql.startsWith("SELECT id FROM scholarly_works WHERE research_item_id")) return { rows: existingTargetRegistry ? [{ id: "primary-registry" }] : [], rowCount: existingTargetRegistry ? 1 : 0 };
      if (sql.startsWith("SELECT id FROM research_items WHERE id")) return { rows: [], rowCount: 0 };
      if (sql.startsWith("UPDATE scholarly_works SET decision='accepted'")) { const state = states.get(String(values[0])); if (state) { state.decision = "accepted"; if (sql.includes("research_item_id=NULL")) { state.researchItemId = null; state.mergedInto = String(values[1]); } else state.researchItemId = String(values[1]); } return { rows: [{ id: values[0] }], rowCount: state ? 1 : 0 }; }
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

test("merge keeps a second OpenAlex identity as an accepted alias when the public paper already has a registry", async () => {
  const { service, states } = testService(true);
  const first = await service.mergeWork("merge", "paper-existing", "actor");
  assert.equal(first.alias, true); assert.equal(states.get("merge")?.researchItemId, null); assert.equal(states.get("merge")?.mergedInto, "paper-existing");
  const retry = await service.mergeWork("merge", "paper-existing", "actor");
  assert.equal(retry.unchanged, true); assert.equal(retry.alias, true);
});

test("a member-triggered sync always leaves newly discovered works for review", async () => {
  const queries: string[] = [];
  const client = {
    async query(sql: string) {
      queries.push(sql);
      if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: true }] };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const repository = {
    getProfile: async () => ({ userId: "member-1" }),
    createRun: async () => "run-1",
    listSyncProfiles: async () => [{ userId: "member-1", openalexAuthorId: "A1", syncFromYear: 2020, syncToYear: 2026, newWorkPolicy: "auto" }],
    findStoredWork: async () => null,
    upsertDiscoveredWork: async () => ({ created: true, changed: true, row: { id: "work-1", decision: "pending", source_type: "openalex", source_snapshot: {} } }),
    updateMemberSync: async () => undefined,
    finishRun: async () => undefined,
  };
  const service = createScholarlySyncService({
    pool: { query: client.query.bind(client), connect: async () => client } as never,
    repository: repository as never,
    openAlex: { getWorksByAuthor: async () => [{ id: "https://openalex.org/W1", title: "New paper", publication_year: 2026, type: "article", authorships: [] }] } as never,
    crossref: {} as never, enabled: true,
    providerConfig: { openAlexKeyConfigured: true, crossrefContactConfigured: false },
  });
  const result = await service.syncMember("member-1", "member-1", "self");
  assert.equal(result.candidatesCreated, 1);
  assert.equal(result.worksUpdated, 0);
  assert.equal(queries.some((sql) => sql.startsWith("SELECT * FROM scholarly_works")), false);
});

test("system accounts are rejected before author lookup or synchronization", async () => {
  let providerCalled = false, connected = false;
  const service = createScholarlySyncService({
    pool: { query: async () => ({ rows: [] }), connect: async () => { connected = true; throw new Error("must not connect"); } } as never,
    repository: { getProfile: async () => null } as never,
    openAlex: { getAuthor: async () => { providerCalled = true; return {}; } } as never,
    crossref: {} as never, enabled: true,
    providerConfig: { openAlexKeyConfigured: true, crossrefContactConfigured: false },
  });
  await assert.rejects(service.verifyAuthor("system-1", "A1", "system-1", "self"), /成员不存在/);
  await assert.rejects(service.syncMember("system-1", "system-1", "self"), /成员不存在/);
  assert.equal(providerCalled, false);
  assert.equal(connected, false);
});
