import assert from "node:assert/strict";
import test from "node:test";
import { createProfileService, ProfileConflictError } from "./profileService.js";

const row = { user_id: "user-1", username: "alice", member_category: "phd", member_slug: "alice", member_status: "current", degree_level: "phd", public_visible: true, name_zh: "张三", name_en: "Alice", email: "alice@example.com", phone: "123", bio_zh: "简介", bio_en: "Bio", research_interests_zh: "导航", research_interests_en: "Navigation", enrollment_year: "2024", graduation_year: "", major_zh: "自动化", major_en: "Automation", thesis_zh: "", thesis_en: "", destination_zh: "", destination_en: "", avatar_asset_id: "new-avatar", avatar_url: "https://cdn/new.png", avatar_position_x: 42, avatar_position_y: 61, avatar_zoom: "1.25", personal_links: [{ labelZh: "代码", labelEn: "Code", url: "https://github.com/a" }], public_fields: ["name_zh"], version: "2" };
const body = { version: 1, memberStatus: "current", degreeLevel: "phd", nameZh: "张三", nameEn: "Alice", email: "alice@example.com", phone: "secret-phone", bioZh: "简介", bioEn: "Bio", researchInterestsZh: "导航", researchInterestsEn: "Navigation", enrollmentYear: "2024", graduationYear: "", majorZh: "自动化", majorEn: "Automation", thesisZh: "", thesisEn: "", destinationZh: "", destinationEn: "", avatarAssetId: "new-avatar", avatarPositionX: 42, avatarPositionY: 61, avatarZoom: 1.25, personalLinks: [{ labelZh: "代码", labelEn: "Code", url: "https://github.com/a" }], publicFields: ["bio", "links"] as Array<"bio" | "links"> };

class Client {
  calls: Array<{ sql: string; values?: unknown[] }> = [];
  released = false; conflict = false;
  async query(sql: string, values?: unknown[]) {
    this.calls.push({ sql, values });
    if (sql.includes("FOR UPDATE")) return { rowCount: 1, rows: [{ ...row, avatar_asset_id: "old-avatar", version: "1" }] };
    if (sql.includes("SELECT 1 FROM media_assets")) return { rowCount: 1, rows: [{ exists: 1 }] };
    if (sql.includes("UPDATE user_profiles SET")) return this.conflict ? { rowCount: 0, rows: [] } : { rowCount: 1, rows: [] };
    if (sql.includes("SELECT user_profiles.*")) return { rowCount: 1, rows: [row] };
    return { rowCount: 1, rows: [] };
  }
  release() { this.released = true; }
}

test("profile update uses account data directly and recycles an unreferenced old avatar", async () => {
  const client = new Client();
  const result = await createProfileService({ connect: async () => client } as never).updateProfile("user-1", body as never);
  assert.equal(client.calls.some((call) => call.sql.includes("UPDATE team_members")), false);
  assert.ok(client.calls.some((call) => call.sql.includes("status='recycled'")));
  assert.equal(JSON.stringify(client.calls.find((call) => call.values?.includes("profile.update"))?.values).includes("secret-phone"), false);
  assert.equal(result.avatarUrl, "https://cdn/new.png");
  assert.equal(result.avatarZoom, 1.25);
  assert.equal(client.calls.at(-1)?.sql, "COMMIT");
  assert.equal(client.released, true);
});

test("profile version conflicts roll back before recycling the old avatar", async () => {
  const client = new Client(); client.conflict = true;
  await assert.rejects(createProfileService({ connect: async () => client } as never).updateProfile("user-1", body as never), ProfileConflictError);
  assert.equal(client.calls.some((call) => call.sql.includes("status='recycled'")), false);
  assert.equal(client.calls.at(-1)?.sql, "ROLLBACK");
});
