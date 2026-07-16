import assert from "node:assert/strict";
import test from "node:test";
import { createPostgresPublicSiteRepository } from "./postgres-repository.js";

test("public repository preserves publication fields, links, and bigint facility ids", async () => {
  const queryable = { async query(sql: string) {
    if (sql.includes("FROM research_items ")) return { rows: [{ id: "paper-1", sort_order: 0, image_src: "/paper.jpg", image_asset_id: "11111111-1111-4111-8111-111111111111", pdf_src: "/paper.pdf", pdf_asset_id: "22222222-2222-4222-8222-222222222222" }] };
    if (sql.includes("FROM research_item_links")) return { rows: [{ research_item_id: "paper-1", sort_order: 0, label_zh: "项目", label_en: "Project", href: "/paper", icon: "link", variant: "primary" }] };
    if (sql.includes("FROM facility_items")) return { rows: [{ id: "9223372036854775807", category_key: "quadrupeds", sort_order: 0, image_src: "/robot.jpg", image_asset_id: "33333333-3333-4333-8333-333333333333" }] };
    return { rows: [] };
  } };
  const repository = createPostgresPublicSiteRepository(queryable as never);
  const [research, facilities] = await Promise.all([repository.getResearchItems(), repository.getFacilityItems()]);
  assert.equal(research[0].links[0].variant, "primary");
  assert.equal(research[0].image.assetId, "11111111-1111-4111-8111-111111111111");
  assert.equal(research[0].pdf.assetId, "22222222-2222-4222-8222-222222222222");
  assert.equal(facilities[0].id, "9223372036854775807");
});

test("public repository preserves asset-only and src-only media references outside member profiles", async () => {
  const queryable = { async query(sql: string) {
    if (sql.includes("FROM research_items ")) return { rows: [
      { id: "asset-paper", sort_order: 0, image_asset_id: "11111111-1111-4111-8111-111111111111", image_src: null, pdf_asset_id: "22222222-2222-4222-8222-222222222222", pdf_src: "" },
      { id: "src-paper", sort_order: 1, image_asset_id: null, image_src: "/paper.jpg", pdf_asset_id: null, pdf_src: "/paper.pdf" },
    ] };
    if (sql.includes("FROM news_items")) return { rows: [{ id: "news", sort_order: 0, image_asset_id: null, image_src: "/news.jpg" }] };
    if (sql.includes("FROM facility_items")) return { rows: [{ id: "20", category_key: "quadrupeds", sort_order: 0, image_asset_id: "55555555-5555-4555-8555-555555555555", image_src: null }] };
    return { rows: [] };
  } };
  const repository = createPostgresPublicSiteRepository(queryable as never);
  const [research, news, facilities] = await Promise.all([repository.getResearchItems(), repository.getNewsItems(), repository.getFacilityItems()]);
  assert.equal(research[0].image.assetId, "11111111-1111-4111-8111-111111111111");
  assert.equal(research[1].image.src, "/paper.jpg");
  assert.equal(news[0].image.src, "/news.jpg");
  assert.equal(facilities[0].image.assetId, "55555555-5555-4555-8555-555555555555");
});

test("public members come from visible account profiles and honor field visibility", async () => {
  const queryable = { async query(sql: string) {
    if (sql.includes("FROM user_profiles")) return { rows: [{
      user_id: "user-1", username: "alice", member_slug: "alice", public_fields: ["avatar", "name_zh", "academic", "major", "research", "links", "email"],
      member_status: "current", member_category: "phd", degree_level: "phd", enrollment_year: "2024", graduation_year: "",
      name_zh: "张三", name_en: "Alice", bio_zh: "私密简介", bio_en: "Private bio", major_zh: "自动化", major_en: "Automation",
      research_interests_zh: "导航", research_interests_en: "Navigation", thesis_zh: "", thesis_en: "", destination_zh: "", destination_en: "",
      avatar_asset_id: "avatar-1", avatar_url: "https://cdn/avatar.png", email: "alice@example.com", phone: "never-public",
      avatar_position_x: 42, avatar_position_y: 61, avatar_zoom: "1.25",
      personal_links: [{ labelZh: "代码", labelEn: "Code", url: "https://github.com/alice" }],
    }] };
    return { rows: [] };
  } };
  const member = (await createPostgresPublicSiteRepository(queryable as never).getTeamMembers())[0];
  assert.deepEqual(member.name, { zh: "张三", en: "" });
  assert.deepEqual(member.degree, { zh: "2024级博士", en: "PhD, Class of 2024" });
  assert.equal(member.bio.zh, "");
  assert.equal(member.image.src, "https://cdn/avatar.png");
  assert.deepEqual({ positionX: member.image.positionX, positionY: member.image.positionY, zoom: member.image.zoom }, { positionX: 42, positionY: 61, zoom: 1.25 });
  assert.deepEqual(member.links[0], { label: { zh: "代码", en: "Code" }, href: "https://github.com/alice", icon: "link", variant: "" });
  assert.equal(JSON.stringify(member).includes("never-public"), false);
});

test("alumni profiles expose graduation, thesis, and destination only when selected", async () => {
  const queryable = { async query(sql: string) {
    if (sql.includes("FROM user_profiles")) return { rows: [{
      username: "graduate", member_slug: "graduate", public_fields: ["name_zh", "academic", "thesis", "destination"], member_status: "alumni",
      member_category: "alumni", degree_level: "master", enrollment_year: "", graduation_year: "2025", name_zh: "李四", name_en: "Li Si",
      bio_zh: "", bio_en: "", major_zh: "", major_en: "", research_interests_zh: "", research_interests_en: "",
      thesis_zh: "毕业设计", thesis_en: "Thesis", destination_zh: "某研究院", destination_en: "Institute", personal_links: [], email: "",
    }] };
    return { rows: [] };
  } };
  const member = (await createPostgresPublicSiteRepository(queryable as never).getTeamMembers())[0];
  assert.equal(member.group, "alumni");
  assert.deepEqual(member.graduation, { zh: "2025届硕士", en: "Master, Graduated 2025" });
  assert.deepEqual(member.thesis, { zh: "毕业设计", en: "Thesis" });
  assert.deepEqual(member.destination, { zh: "某研究院", en: "Institute" });
});
