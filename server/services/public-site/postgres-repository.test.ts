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

test("public repository exposes news categories and complete contact extra cards", async () => {
  const queryable = { async query(sql: string) {
    if (sql.includes("FROM news_items")) return { rows: [{
      id: "news-1", sort_order: 0, category_zh: "学术动态", category_en: "Research"
    }] };
    if (sql.includes("FROM contact_extra_cards")) return { rows: [{
      icon: "map-pin", title_zh: "位置", title_en: "Location",
      description_zh: "来访前请联系", description_en: "Contact us before visiting",
      value_zh: "武汉大学", value_en: "Wuhan University",
      href: "https://maps.example.test", button_label_zh: "查看地图", button_label_en: "Open map"
    }] };
    return { rows: [] };
  } };
  const repository = createPostgresPublicSiteRepository(queryable as never);
  const [news, contact] = await Promise.all([repository.getNewsItems(), repository.getContactItems()]);

  assert.deepEqual(news[0].category, { zh: "学术动态", en: "Research" });
  assert.deepEqual(contact.extraCards[0], {
    icon: "map-pin",
    title: { zh: "位置", en: "Location" },
    description: { zh: "来访前请联系", en: "Contact us before visiting" },
    value: { zh: "武汉大学", en: "Wuhan University" },
    href: "https://maps.example.test",
    buttonLabel: { zh: "查看地图", en: "Open map" }
  });
});

test("public members come from visible account profiles and honor field visibility", async () => {
  let teamSql="";const queryable = { async query(sql: string) {
    teamSql=sql;
    if (sql.includes("FROM user_profiles")) return { rows: [{
      user_id: "user-1", username: "alice", member_slug: "alice", public_fields: ["avatar", "name_zh", "academic_stage", "enrollment_year", "major", "research", "links", "email"],
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
  assert.match(teamSql,/u\.account_kind='person'/);
});

test("postdocs keep their role title but show the cohort as a PhD class", async () => {
  const queryable = { async query(sql: string) {
    if (!sql.includes("FROM user_profiles")) return { rows: [] };
    return { rows: [{
      username: "postdoc", member_slug: "postdoc", public_fields: ["name_zh", "academic_stage", "enrollment_year"],
      member_status: "current", degree_level: "postdoc", enrollment_year: "2024", graduation_year: "",
      name_zh: "博士后", name_en: "Postdoc", bio_zh: "", bio_en: "", major_zh: "", major_en: "",
      research_interests_zh: "", research_interests_en: "", thesis_zh: "", thesis_en: "", destination_zh: "", destination_en: "",
      personal_links: [], email: "", phone: "", avatar_url: null,
    }] };
  } };
  const member = (await createPostgresPublicSiteRepository(queryable as never).getTeamMembers())[0];
  assert.equal(member.group, "postdoc");
  assert.deepEqual(member.role, { zh: "博士后", en: "Postdoctoral Researcher" });
  assert.deepEqual(member.degree, { zh: "2024级博士", en: "PhD, Class of 2024" });
});

test("public member detail is privacy-gated and loads distinct accepted final publications in two queries", async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const queryable = { async query(sql: string, values?: unknown[]) {
    calls.push({ sql, values });
    if (sql.includes("account_user_id")) return { rows: [{
      account_user_id: "user-1", username: "alice", member_slug: "alice", public_visible: true,
      public_fields: ["name_zh", "research"], member_status: "current", degree_level: "phd",
      name_zh: "张三", name_en: "Private English", research_interests_zh: "导航", research_interests_en: "Navigation",
      enrollment_year: "2024", graduation_year: "", bio_zh: "Private bio", bio_en: "", major_zh: "", major_en: "",
      thesis_zh: "", thesis_en: "", destination_zh: "", destination_en: "", personal_links: [], email: "private@example.com", phone: "private-phone",
    }] };
    if (sql.includes("WITH final_ids")) return { rows: [{
      id: "paper-1", sort_order: 0, title_zh: "", title_en: "A Paper", publication_year: 2025,
      venue_zh: "", venue_en: "Journal", publication_type: "journal", topic: "navigation",
      public_authors: [{ name: { zh: "", en: "Alice" }, highlight: true }],
      public_links: [{ label: { zh: "DOI", en: "DOI" }, href: "https://doi.org/10.1/example", icon: "doi", variant: "" }],
    }] };
    return { rows: [] };
  } };
  const detail = await createPostgresPublicSiteRepository(queryable as never).getTeamMemberProfile!("alice");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].values?.[0], "alice");
  assert.match(calls[0].sql, /public_visible=true/);
  assert.match(calls[0].sql, /account_kind='person'/);
  assert.match(calls[1].sql, /SELECT DISTINCT COALESCE/);
  assert.match(calls[1].sql, /decision='accepted'/);
  assert.match(calls[1].sql, /mergedIntoResearchItemId/);
  assert.deepEqual(detail?.member.name, { zh: "张三", en: "" });
  assert.equal(detail?.publications.length, 1);
  assert.equal(JSON.stringify(detail).includes("private@example.com"), false);
  assert.equal(JSON.stringify(detail).includes("Private bio"), false);
});

test("unknown or private public member details both return null without querying publications", async () => {
  let calls = 0;
  const repository = createPostgresPublicSiteRepository({ async query() { calls += 1; return { rows: [] }; } } as never);
  assert.equal(await repository.getTeamMemberProfile!("private-member"), null);
  assert.equal(calls, 1);
});

test("public lab projections expose only opted-in profile, public specs, and safe component fields",async()=>{const calls:string[]=[];const queryable={async query(sql:string){calls.push(sql);if(sql.includes("FROM lab_platform_public_profiles pp JOIN lab_platforms"))return{rows:[{id:"1",category:"robot",category_zh:"机器人",category_en:"Robots",title_zh:"平台",title_en:"Platform",description_zh:"公开",description_en:"Public",tags:["导航"],component_display_mode:"detail",sort_order:0,image_src:"/platform.jpg",code:"SECRET-CODE",vendor_serial:"SECRET-SERIAL",storage_location:"SECRET-ROOM",assigned_user_id:"SECRET-USER"}]};if(sql.includes("FROM lab_platform_specs"))return{rows:[{platform_id:"1",label_zh:"重量",label_en:"Weight",value_zh:"12",value_en:"12",unit:"kg",public_visible:true}]};if(sql.includes("FROM lab_assets a JOIN lab_device_types"))return{rows:[{current_platform_id:"1",platform_role_zh:"前视",platform_role_en:"Front",device_type:"相机",manufacturer:"Intel",model:"D455",code:"CAM-SECRET",vendor_serial:"SN-SECRET",storage_location:"ROOM",assigned_user_id:"USER"}]};return{rows:[]}}};const item=(await createPostgresPublicSiteRepository(queryable as never).getPublicLabPlatforms!())[0];const serialized=JSON.stringify(item);assert.equal(item.title.zh,"平台");assert.equal(item.specs.length,1);assert.equal(item.components[0].role.zh,"前视");for(const secret of["SECRET-CODE","SECRET-SERIAL","SECRET-ROOM","SECRET-USER","CAM-SECRET","SN-SECRET","ROOM","USER"])assert.equal(serialized.includes(secret),false);const platformSql=calls.find((sql)=>sql.includes("FROM lab_platform_public_profiles pp JOIN lab_platforms"))??"";const specSql=calls.find((sql)=>sql.includes("FROM lab_platform_specs"))??"";assert.match(platformSql,/WHERE pp\.public_visible=true/);assert.doesNotMatch(platformSql,/a\.code|vendor_serial|storage_location|assigned_user|borrower|procurement/);assert.match(specSql,/s\.public_visible=true/);});

test("public platform component modes support none, summary, and detail",async()=>{const queryable={async query(sql:string){if(sql.includes("FROM lab_platform_public_profiles pp JOIN lab_platforms"))return{rows:["none","summary","detail"].map((mode,index)=>({id:String(index+1),category:"robot",title_zh:mode,title_en:mode,description_zh:"",description_en:"",tags:[],component_display_mode:mode,sort_order:index}))};if(sql.includes("FROM lab_assets a JOIN lab_device_types"))return{rows:[{current_platform_id:"1",platform_role_zh:"前视",device_type:"相机",manufacturer:"Intel",model:"D455"},{current_platform_id:"2",platform_role_zh:"前视",device_type:"相机",manufacturer:"Intel",model:"D455"},{current_platform_id:"2",platform_role_zh:"后视",device_type:"相机",manufacturer:"Intel",model:"D455"},{current_platform_id:"3",platform_role_zh:"前视",device_type:"相机",manufacturer:"Intel",model:"D455"}]};return{rows:[]}}};const items=await createPostgresPublicSiteRepository(queryable as never).getPublicLabPlatforms!();assert.equal(items[0].components.length,0);assert.deepEqual(items[1].components.map((item:any)=>item.count),[2]);assert.equal(items[2].components[0].role.zh,"前视");});

test("independently public assets use a safe allowlist and exclude retired records",async()=>{const calls:string[]=[];const queryable={async query(sql:string){calls.push(sql);if(sql.includes("FROM lab_asset_public_profiles ap JOIN lab_assets"))return{rows:[{id:"7",category:"lidar",category_name:"激光雷达",title_zh:"核心雷达",title_en:"Core LiDAR",description_zh:"公开介绍",description_en:"Public",sort_order:0,image_src:null,code:"ASSET-SECRET",vendor_serial:"SERIAL-SECRET",storage_location:"ROOM-SECRET",assigned_user_id:"USER-SECRET"}]};if(sql.includes("FROM lab_asset_specs"))return{rows:[{asset_id:"7",label_zh:"量程",label_en:"Range",value_zh:"100",value_en:"100",unit:"m"}]};return{rows:[]}}};const item=(await createPostgresPublicSiteRepository(queryable as never).getPublicLabAssets!())[0];const serialized=JSON.stringify(item);assert.equal(item.title.zh,"核心雷达");assert.equal(item.specs[0].value.zh,"100 m");for(const secret of["ASSET-SECRET","SERIAL-SECRET","ROOM-SECRET","USER-SECRET"])assert.equal(serialized.includes(secret),false);const assetSql=calls.find((sql)=>sql.includes("FROM lab_asset_public_profiles ap JOIN lab_assets"))??"";assert.match(assetSql,/ap\.public_visible=true/);assert.match(assetSql,/a\.condition<>'retired'/);assert.doesNotMatch(assetSql,/a\.code|vendor_serial|storage_location|assigned_user|borrower|procurement/);});

test("alumni profiles expose graduation, thesis, and destination only when selected", async () => {
  const queryable = { async query(sql: string) {
    if (sql.includes("FROM user_profiles")) return { rows: [{
      username: "graduate", member_slug: "graduate", public_fields: ["name_zh", "academic_stage", "graduation_year", "thesis", "destination"], member_status: "alumni",
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

test("public member academic stage, years, email, and phone project independently", async () => {
  const profile = {
    username: "member", member_slug: "member", member_status: "current", degree_level: "phd",
    enrollment_year: "2024", graduation_year: "2028", name_zh: "成员", name_en: "Member",
    bio_zh: "", bio_en: "", major_zh: "", major_en: "", research_interests_zh: "", research_interests_en: "",
    thesis_zh: "", thesis_en: "", destination_zh: "", destination_en: "", personal_links: [],
    email: "public@example.com", phone: "12345",
  };
  const project = async (public_fields: string[]) => {
    const queryable = { async query(sql: string) { return { rows: sql.includes("FROM user_profiles") ? [{ ...profile, public_fields }] : [] }; } };
    return (await createPostgresPublicSiteRepository(queryable as never).getTeamMembers())[0];
  };

  const stageOnly = await project(["name_zh", "academic_stage"]);
  assert.deepEqual(stageOnly.degree, { zh: "博士", en: "PhD" });
  assert.deepEqual(stageOnly.enrollmentYear, { zh: "", en: "" });

  const yearOnly = await project(["name_zh", "enrollment_year"]);
  assert.deepEqual(yearOnly.degree, { zh: "", en: "" });
  assert.deepEqual(yearOnly.enrollmentYear, { zh: "2024级", en: "Class of 2024" });

  const phoneOnly = await project(["name_zh", "phone"]);
  assert.deepEqual(phoneOnly.contacts, [{ label: { zh: "电话", en: "Phone" }, value: { zh: "12345", en: "12345" } }]);
  assert.equal(JSON.stringify(phoneOnly).includes("public@example.com"), false);
});

test("every public profile field is projected independently", async () => {
  const base = {
    username: "toggle-member", member_slug: "toggle-member", member_status: "current", degree_level: "phd",
    enrollment_year: "2024", graduation_year: "2028", name_zh: "唯一中文姓名", name_en: "Unique English Name",
    bio_zh: "唯一简介", bio_en: "Unique Bio", major_zh: "唯一专业", major_en: "Unique Major",
    research_interests_zh: "唯一研究", research_interests_en: "Unique Research",
    thesis_zh: "唯一论文", thesis_en: "Unique Thesis", destination_zh: "唯一去向", destination_en: "Unique Destination",
    personal_links: [{ labelZh: "唯一链接", labelEn: "Unique Link", url: "https://example.com/unique-link" }],
    email: "unique-public@example.com", phone: "unique-phone-123", avatar_asset_id: "avatar-id",
    avatar_url: "https://example.com/unique-avatar.png", avatar_position_x: 45, avatar_position_y: 55, avatar_zoom: "1.2",
  };
  const project = async (field: string, enabled: boolean, alumni = false) => {
    const requiredName = field === "name_zh" ? "name_en" : "name_zh";
    const public_fields = enabled ? [...new Set([requiredName, field])] : [requiredName];
    const queryable = { async query(sql: string) { return { rows: sql.includes("FROM user_profiles") ? [{ ...base, member_status: alumni ? "alumni" : "current", public_fields }] : [] }; } };
    return createPostgresPublicSiteRepository(queryable as never).getTeamMembers().then((members) => members[0]);
  };
  const cases: Array<[string, string, boolean?]> = [
    ["avatar", "unique-avatar.png"], ["name_zh", "唯一中文姓名"], ["name_en", "Unique English Name"],
    ["academic_stage", "PhD"], ["enrollment_year", "Class of 2024"], ["graduation_year", "Graduated 2028", true],
    ["major", "Unique Major"], ["research", "Unique Research"], ["bio", "Unique Bio"],
    ["email", "unique-public@example.com"], ["phone", "unique-phone-123"], ["links", "unique-link"],
    ["thesis", "Unique Thesis", true], ["destination", "Unique Destination", true],
  ];
  for (const [field, sentinel, alumni] of cases) {
    assert.equal(JSON.stringify(await project(field, true, alumni)).includes(sentinel), true, `${field} should project when enabled`);
    assert.equal(JSON.stringify(await project(field, false, alumni)).includes(sentinel), false, `${field} should not project when disabled`);
  }
});

test("avatar alt text does not leak a name whose public toggle is off", async () => {
  const queryable = { async query(sql: string) { return { rows: sql.includes("FROM user_profiles") ? [{
    username: "anonymous", member_slug: "anonymous", member_status: "current", degree_level: "master",
    public_fields: ["avatar", "name_en"], name_zh: "不应公开的姓名", name_en: "Public Name",
    avatar_asset_id: "avatar", avatar_url: "https://example.com/avatar.png", avatar_position_x: 50, avatar_position_y: 50, avatar_zoom: "1",
    enrollment_year: "", graduation_year: "", bio_zh: "", bio_en: "", major_zh: "", major_en: "",
    research_interests_zh: "", research_interests_en: "", thesis_zh: "", thesis_en: "", destination_zh: "", destination_en: "",
    personal_links: [], email: "", phone: "",
  }] : [] }; } };
  const member = (await createPostgresPublicSiteRepository(queryable as never).getTeamMembers())[0];
  assert.equal(member.image?.alt, "Public Name");
  assert.equal(JSON.stringify(member).includes("不应公开的姓名"), false);
});
