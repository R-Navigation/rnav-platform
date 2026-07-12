import assert from "node:assert/strict";
import test from "node:test";
import { createPostgresPublicSiteRepository } from "./postgres-repository.js";

test("public repository reads round-trip-only fields without narrowing them", async () => {
  const queryable = {
    async query(sql: string, _values?: readonly unknown[]) {
      if (sql.includes("FROM research_items ")) return { rows: [{ id: "paper-1", sort_order: 0, image_src: "/paper.jpg", image_asset_id: "11111111-1111-4111-8111-111111111111", pdf_src: "/paper.pdf", pdf_asset_id: "22222222-2222-4222-8222-222222222222" }] };
      if (sql.includes("FROM research_item_links")) return { rows: [{ research_item_id: "paper-1", sort_order: 0, label_zh: "项目", label_en: "Project", href: "/paper", icon: "link", variant: "primary" }] };
      if (sql.includes("FROM team_members")) return { rows: [{ id: "10", slug: "alice", group_key: "phd", sort_order: 0 }] };
      if (sql.includes("FROM team_member_contacts")) return { rows: [{ team_member_id: "10", sort_order: 0, label_zh: "邮箱", label_en: "Email", value_zh: "中文地址", value_en: "english@example.com" }] };
      if (sql.includes("FROM facility_items")) return { rows: [{ id: "9223372036854775807", category_key: "quadrupeds", sort_order: 0, image_src: "/robot.jpg", image_asset_id: "33333333-3333-4333-8333-333333333333" }] };
      return { rows: [] };
    }
  };
  const repository = createPostgresPublicSiteRepository(queryable as never);

  const [research, team, facilities] = await Promise.all([
    repository.getResearchItems(), repository.getTeamMembers(), repository.getFacilityItems()
  ]);

  assert.equal(research[0].links[0].variant, "primary");
  assert.equal(research[0].image.assetId, "11111111-1111-4111-8111-111111111111");
  assert.equal(research[0].pdf.assetId, "22222222-2222-4222-8222-222222222222");
  assert.deepEqual(team[0].contacts[0].value, { zh: "中文地址", en: "english@example.com" });
  assert.equal(facilities[0].id, "9223372036854775807");
  assert.equal(facilities[0].image.assetId, "33333333-3333-4333-8333-333333333333");
});
