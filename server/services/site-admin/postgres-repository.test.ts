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
