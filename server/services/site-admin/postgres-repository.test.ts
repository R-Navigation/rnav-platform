import assert from "node:assert/strict";
import test from "node:test";
import { RevisionConflictError, createPostgresSiteAdminRepository } from "./postgres-repository.js";

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
    links: [{ label: { zh: "项目", en: "Project" }, href: "/paper", icon: "link" }]
  }], "7", "user-1");
  assert.equal(updatedAt, "8");
  const sql = client.calls.map(({ sql }) => sql);
  assert.equal(sql[0], "BEGIN");
  assert.equal(sql.some((value) => value.includes("DELETE FROM research_items")), true);
  assert.equal(sql.some((value) => value.includes("INSERT INTO research_item_authors")), true);
  assert.equal(sql.some((value) => value.includes("INSERT INTO audit_logs")), true);
  assert.equal(sql.at(-1), "COMMIT");
  assert.equal(client.released, true);
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
  const repository = createPostgresSiteAdminRepository(pool as never, { publicRepository });
  const snapshot = await repository.getSnapshot();
  assert.equal(snapshot.researchItems.items[0].image.assetId, null);
  assert.equal(snapshot.researchItems.items[0].pdf.assetId, null);
  assert.equal(snapshot.teamMembers.items[0].image.assetId, null);
  assert.equal(snapshot.facilityItems.items[0].image.assetId, null);
});
