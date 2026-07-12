import assert from "node:assert/strict";
import test from "node:test";
import { AssetReferenceError, RevisionConflictError, createPostgresSiteAdminRepository } from "./postgres-repository.js";

type Call = { sql: string; values?: readonly unknown[] };

class FakeClient {
  calls: Call[] = [];
  released = false;
  failOn = "";
  async query(sql: string, values?: readonly unknown[]) {
    this.calls.push({ sql, values });
    if (this.failOn && sql.includes(this.failOn)) throw new Error("insert failed");
    if (sql.includes("UPDATE site_content_revisions")) {
      return values?.[1] === "7" ? { rowCount: 1, rows: [{ revision: "8" }] } : { rowCount: 0, rows: [] };
    }
    if (sql.includes("RETURNING id::text AS id")) return { rowCount: 1, rows: [{ id: "101" }] };
    return { rowCount: 1, rows: [] };
  }
  release() { this.released = true; }
}

test("snapshot uses one repeatable-read read-only transaction for every query", async () => {
  const client = new FakeClient();
  const poolQueries: string[] = [];
  const pool = {
    connect: async () => client,
    query: async (sql: string) => {
      poolQueries.push(sql);
      return { rowCount: 0, rows: [] };
    }
  };
  const repository = createPostgresSiteAdminRepository(pool as never);

  await repository.getSnapshot();

  assert.deepEqual(poolQueries, []);
  assert.equal(client.calls[0]?.sql, "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  assert.equal(client.calls.some(({ sql }) => sql.includes("FROM page_content")), true);
  assert.equal(client.calls.some(({ sql }) => sql.includes("FROM site_content_revisions")), true);
  assert.equal(client.calls.some(({ sql }) => sql.includes("FROM research_items")), true);
  assert.equal(client.calls.some(({ sql }) => sql.includes("FROM contact_extra_cards")), true);
  assert.equal(client.calls.at(-1)?.sql, "COMMIT");
  assert.equal(client.released, true);
});

test("snapshot rolls back before releasing when a read fails", async () => {
  const client = new FakeClient();
  client.failOn = "FROM research_items";
  const repository = createPostgresSiteAdminRepository({ connect: async () => client } as never);

  await assert.rejects(repository.getSnapshot(), /insert failed/);

  assert.equal(client.calls.at(-1)?.sql, "ROLLBACK");
  assert.equal(client.released, true);
});

test("page update returns a conflict before changing content", async () => {
  const client = new FakeClient();
  const repository = createPostgresSiteAdminRepository({ connect: async () => client } as never);
  await assert.rejects(
    repository.replacePage("home", { hero: {} }, "6", "user-1"),
    RevisionConflictError
  );
  assert.equal(client.calls.some(({ sql }) => sql.includes("INSERT INTO page_content")), false);
  assert.equal(client.calls.at(-1)?.sql, "ROLLBACK");
});

test("multi-table replacement and audit commit in one transaction", async () => {
  const client = new FakeClient();
  const repository = createPostgresSiteAdminRepository({ connect: async () => client } as never);
  const updatedAt = await repository.replaceResearchItems([{
    id: "paper-1", sortOrder: 0, title: { zh: "论文", en: "Paper" }, year: 2026,
    keywords: [{ zh: "导航", en: "Navigation" }], authors: [{ name: { zh: "艾丽丝", en: "Alice" }, highlight: true }],
    image: { assetId: "11111111-1111-4111-8111-111111111111", src: "/paper.jpg" },
    pdf: { assetId: "22222222-2222-4222-8222-222222222222", src: "/paper.pdf" },
    links: [{ label: { zh: "项目", en: "Project" }, href: "/paper", icon: "link", variant: "primary" }]
  }], "7", "user-1");
  assert.equal(updatedAt, "8");
  const sql = client.calls.map(({ sql }) => sql);
  assert.equal(sql[0], "BEGIN");
  assert.equal(sql.some((value) => value.includes("DELETE FROM research_items")), true);
  assert.equal(sql.some((value) => value.includes("INSERT INTO research_item_authors")), true);
  const itemInsert = client.calls.find(({ sql: statement }) => statement.includes("INSERT INTO research_items"));
  assert.equal(itemInsert?.values?.includes("11111111-1111-4111-8111-111111111111"), true);
  assert.equal(itemInsert?.values?.includes("22222222-2222-4222-8222-222222222222"), true);
  const linkInsert = client.calls.find(({ sql: statement }) => statement.includes("INSERT INTO research_item_links"));
  assert.equal(linkInsert?.values?.at(-1), "primary");
  assert.equal(sql.some((value) => value.includes("INSERT INTO audit_logs")), true);
  assert.equal(sql.at(-1), "COMMIT");
  assert.equal(client.released, true);
});

test("team contacts persist localized values", async () => {
  const client = new FakeClient();
  const repository = createPostgresSiteAdminRepository({ connect: async () => client } as never);

  await repository.replaceTeamMembers([{
    slug: "alice", group: "phd",
    contacts: [{ label: { zh: "邮箱", en: "Email" }, value: { zh: "中文地址", en: "english@example.com" } }]
  }], "7", "user-1");

  const contactInsert = client.calls.find(({ sql }) => sql.includes("INSERT INTO team_member_contacts"));
  assert.match(contactInsert?.sql ?? "", /value_zh, value_en/);
  assert.deepEqual(contactInsert?.values?.slice(-2), ["中文地址", "english@example.com"]);
});

test("facility replacement preserves a supplied bigint id", async () => {
  const client = new FakeClient();
  const repository = createPostgresSiteAdminRepository({ connect: async () => client } as never);

  await repository.replaceFacilityItems([{ id: "9223372036854775807", category: "quadrupeds" }], "7", "user-1");

  const facilityInsert = client.calls.find(({ sql }) => sql.includes("INSERT INTO facility_items"));
  assert.match(facilityInsert?.sql ?? "", /\(id, category_key/);
  assert.equal(facilityInsert?.values?.[0], "9223372036854775807");
});

test("failed child insert rolls back the replacement and audit", async () => {
  const client = new FakeClient();
  client.failOn = "INSERT INTO research_item_authors";
  const repository = createPostgresSiteAdminRepository({ connect: async () => client } as never);
  await assert.rejects(repository.replaceResearchItems([{
    id: "paper-1", title: { zh: "论文", en: "Paper" },
    authors: [{ name: { en: "Alice" }, highlight: false }]
  }], "7", "user-1"), /insert failed/);
  assert.equal(client.calls.some(({ sql }) => sql.includes("INSERT INTO audit_logs")), false);
  assert.equal(client.calls.at(-1)?.sql, "ROLLBACK");
  assert.equal(client.released, true);
});

test("mutation preserves the primary error and attaches rollback and release failures", async () => {
  const primary = new Error("insert failed");
  const rollback = new Error("rollback failed");
  const release = new Error("release failed");
  const client = new FakeClient();
  client.query = async (sql: string, values?: readonly unknown[]) => {
    client.calls.push({ sql, values });
    if (sql.includes("UPDATE site_content_revisions")) return { rowCount: 1, rows: [{ revision: "8" }] };
    if (sql.includes("INSERT INTO page_content")) throw primary;
    if (sql === "ROLLBACK") throw rollback;
    return { rowCount: 1, rows: [] };
  };
  client.release = () => { client.released = true; throw release; };
  const repository = createPostgresSiteAdminRepository({ connect: async () => client } as never);

  const error = await repository.replacePage("home", {}, "7", "user-1").catch((caught) => caught);

  assert.equal(error, primary);
  assert.deepEqual((error as Error & { cleanupFailures?: unknown[] }).cleanupFailures, [rollback, release]);
});

test("asset foreign-key failures map to a safe domain error", async () => {
  const client = new FakeClient();
  client.query = async (sql: string, values?: readonly unknown[]) => {
    client.calls.push({ sql, values });
    if (sql.includes("UPDATE site_content_revisions")) return { rowCount: 1, rows: [{ revision: "8" }] };
    if (sql.includes("INSERT INTO research_items")) throw Object.assign(new Error("database detail"), { code: "23503", constraint: "research_items_image_asset_id_fkey" });
    return { rowCount: 1, rows: [] };
  };
  const repository = createPostgresSiteAdminRepository({ connect: async () => client } as never);

  await assert.rejects(repository.replaceResearchItems([{ id: "paper-1" }], "7", "user-1"), AssetReferenceError);
});

test("collection replacements use the expected transaction, delete, audit, and commit shape", async () => {
  const cases = [
    ["replaceNewsItems", [{ id: "news-1" }], "DELETE FROM news_items", "site.news.replace"],
    ["replaceTeamMembers", [{ slug: "alice", group: "phd" }], "DELETE FROM team_members", "site.members.replace"],
    ["replaceFacilityItems", [{ category: "quadrupeds" }], "DELETE FROM facility_items", "site.facilities.replace"],
    ["replaceContactItems", { primaryChannels: [], socialLinks: [], extraCards: [] }, "DELETE FROM contact_primary_channels", "site.contact.replace"]
  ] as const;

  for (const [method, items, deleteSql, action] of cases) {
    const client = new FakeClient();
    const repository = createPostgresSiteAdminRepository({ connect: async () => client } as never);
    await (repository[method] as (value: any, expected: string, actor: string) => Promise<string>)(items, "7", "user-1");
    assert.equal(client.calls[0]?.sql, "BEGIN", method);
    assert.equal(client.calls.some(({ sql }) => sql.includes(deleteSql)), true, method);
    const auditCall = client.calls.find(({ sql }) => sql.includes("INSERT INTO audit_logs"));
    assert.equal(auditCall?.values?.[1], action, method);
    assert.equal(client.calls.at(-1)?.sql, "COMMIT", method);
    assert.equal(client.released, true, method);
  }
});

test("snapshot normalizes empty asset IDs from an injected public repository", async () => {
  const pool = {
    query: async (sql: string, _values?: readonly unknown[]) =>
      sql.includes("site_content_revisions") ? { rows: [] } : { rows: [] },
    connect: async () => new FakeClient()
  };
  const publicRepository = {
    getResearchItems: async () => [{ id: "paper-1", image: { assetId: "", src: "/paper.jpg" }, pdf: { assetId: "", src: "/paper.pdf" } }],
    getNewsItems: async () => [{ id: "news-1", image: null }],
    getTeamMembers: async () => [{ slug: "alice", group: "phd", image: { assetId: "", src: "/alice.jpg" } }],
    getFacilityItems: async () => [{ category: "quadrupeds", image: { assetId: "", src: "/robot.jpg" } }],
    getContactItems: async () => ({ primaryChannels: [], socialLinks: [], extraCards: [] }),
    getPageContent: async () => null
  };
  const repository = createPostgresSiteAdminRepository(pool as never, { publicRepositoryFactory: () => publicRepository });
  const snapshot = await repository.getSnapshot();
  assert.equal(snapshot.researchItems.items[0].image.assetId, null);
  assert.equal(snapshot.researchItems.items[0].pdf.assetId, null);
  assert.equal(snapshot.teamMembers.items[0].image.assetId, null);
  assert.equal(snapshot.facilityItems.items[0].image.assetId, null);
});
