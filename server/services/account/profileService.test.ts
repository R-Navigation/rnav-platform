import assert from "node:assert/strict";
import test from "node:test";
import { createProfileService, ProfileConflictError } from "./profileService.js";

const row = { user_id: "user-1", username: "alice", member_category: "phd", member_slug: "alice", name_zh: "张三", name_en: "Alice", title_zh: "博士生", title_en: "PhD", email: "alice@example.com", phone: "123", bio_zh: "简介", bio_en: "Bio", research_interests_zh: "导航", research_interests_en: "Navigation", homepage_url: "", github_url: "", avatar_asset_id: null, public_fields: ["name_zh"], version: "2" };
const body = { version: 1, nameZh: "张三", nameEn: "Alice", titleZh: "博士生", titleEn: "PhD", email: "alice@example.com", phone: "secret-phone", bioZh: "简介", bioEn: "Bio", researchInterestsZh: "导航", researchInterestsEn: "Navigation", homepageUrl: "", githubUrl: "", avatarAssetId: null, publicFields: ["bio"] as Array<"bio"> };

class Client {
  calls: Array<{ sql: string; values?: unknown[] }> = [];
  released = false;
  conflict = false;
  async query(sql: string, values?: unknown[]) {
    this.calls.push({ sql, values });
    if (sql.includes("UPDATE user_profiles")) return this.conflict ? { rowCount: 0, rows: [] } : { rowCount: 1, rows: [row] };
    if (sql.includes("SELECT team_member_id")) return { rowCount: 1, rows: [{ team_member_id: "9", member_slug: "alice" }] };
    if (sql.includes("RETURNING username")) return { rowCount: 1, rows: [{ username: "alice" }] };
    return { rowCount: 1, rows: [] };
  }
  release() { this.released = true; }
}

test("profile update atomically clears hidden public fields and never publishes phone", async () => {
  const client = new Client();
  const service = createProfileService({ connect: async () => client } as never);
  const result = await service.updateProfile("user-1", body as never);
  const publicUpdate = client.calls.find((call) => call.sql.includes("UPDATE team_members"));
  assert.ok(publicUpdate);
  assert.equal(publicUpdate.sql.includes("phone"), false);
  assert.equal(JSON.stringify(publicUpdate.values).includes("secret-phone"), false);
  assert.deepEqual(publicUpdate.values?.slice(1, 5), ["课题组成员", "Lab Member", "", ""]);
  assert.equal(result.username, "alice");
  assert.match(client.calls.find((call) => call.sql.includes("profile.update"))?.sql ?? "", /\$1::text/);
  assert.equal(client.calls.at(-1)?.sql, "COMMIT");
  assert.equal(client.released, true);
});

test("profile version conflicts roll back without public writes", async () => {
  const client = new Client(); client.conflict = true;
  const service = createProfileService({ connect: async () => client } as never);
  await assert.rejects(service.updateProfile("user-1", body as never), ProfileConflictError);
  assert.equal(client.calls.some((call) => call.sql.includes("UPDATE team_members")), false);
  assert.equal(client.calls.at(-1)?.sql, "ROLLBACK");
});
