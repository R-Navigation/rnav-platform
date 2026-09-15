import type { Pool } from "pg";
import type { PublicRecord, PublicSiteRepository } from "./service.js";

export type Queryable = Pick<Pool, "query">;

const locale = (row: PublicRecord, prefix: string) => ({ zh: row[`${prefix}_zh`] ?? "", en: row[`${prefix}_en`] ?? "" });
const image = (row: PublicRecord) => row.image_asset_id || row.image_src ? { assetId: row.image_asset_id ?? "", src: row.image_src, alt: row.image_alt ?? "", dataAlt: row.image_data_alt ?? "" } : null;
const groupBy = (rows: PublicRecord[], key: string) => rows.reduce((map, row) => map.set(row[key], [...(map.get(row[key]) ?? []), row]), new Map<unknown, PublicRecord[]>());

export function mapPublicTeamMember(row: PublicRecord) {
  const fields = new Set<string>(row.public_fields ?? []);
  const alumni = row.member_status === "alumni";
  const publicNameZh = fields.has("name_zh") ? row.name_zh : "";
  const publicNameEn = fields.has("name_en") ? row.name_en : "";
  const postdoc = row.degree_level === "postdoc";
  const degreeZh = row.degree_level === "phd" ? "博士" : row.degree_level === "master" ? "硕士" : row.degree_level === "undergrad" ? "本科" : postdoc ? "博士后" : row.degree_level === "faculty" ? "教师" : "";
  const degreeEn = row.degree_level === "phd" ? "PhD" : row.degree_level === "master" ? "Master" : row.degree_level === "undergrad" ? "Bachelor" : postdoc ? "Postdoctoral" : row.degree_level === "faculty" ? "Faculty" : "";
  const academicVisible = fields.has("academic_stage");
  const yearVisible = fields.has(alumni ? "graduation_year" : "enrollment_year");
  const year = alumni ? row.graduation_year : row.enrollment_year;
  const academicZh = academicVisible ? degreeZh : "";
  const academicEn = academicVisible ? degreeEn : "";
  const currentDegree = academicVisible && yearVisible && year
    ? { zh: `${year}级${postdoc ? "博士" : degreeZh}`, en: `${postdoc ? "PhD" : degreeEn}, Class of ${year}` }
    : postdoc ? { zh: "", en: "" } : { zh: academicZh, en: academicEn };
  const role = academicVisible && postdoc ? { zh: "博士后", en: "Postdoctoral Researcher" } : { zh: "", en: "" };
  const currentYear = !academicVisible && yearVisible && year ? { zh: `${year}级`, en: `Class of ${year}` } : { zh: "", en: "" };
  const alumniSummary = {
    zh: [yearVisible && year ? `${year}届` : "", academicZh].filter(Boolean).join(""),
    en: [academicEn, yearVisible && year ? `Graduated ${year}` : ""].filter(Boolean).join(", "),
  };
  return {
    slug: row.member_slug || row.username,
    group: alumni ? "alumni" : row.degree_level === "faculty" ? "advisor" : row.degree_level,
    sortOrder: 0,
    name: { zh: publicNameZh, en: publicNameEn },
    bio: fields.has("bio") ? locale(row, "bio") : { zh: "", en: "" },
    role,
    degree: !alumni ? currentDegree : { zh: "", en: "" },
    enrollmentYear: !alumni ? currentYear : { zh: "", en: "" },
    graduation: alumni ? alumniSummary : { zh: "", en: "" },
    major: fields.has("major") ? locale(row, "major") : { zh: "", en: "" },
    research: fields.has("research") ? { zh: row.research_interests_zh, en: row.research_interests_en } : { zh: "", en: "" },
    thesis: fields.has("thesis") && alumni ? locale(row, "thesis") : { zh: "", en: "" },
    destination: fields.has("destination") && alumni ? locale(row, "destination") : { zh: "", en: "" },
    image: fields.has("avatar") && row.avatar_url ? { assetId: row.avatar_asset_id, src: row.avatar_url, alt: publicNameZh || publicNameEn || "Team member", positionX: row.avatar_position_x, positionY: row.avatar_position_y, zoom: Number(row.avatar_zoom) } : null,
    links: fields.has("links") && Array.isArray(row.personal_links) ? row.personal_links.map((link: any) => ({ label: { zh: link.labelZh ?? "", en: link.labelEn ?? "" }, href: link.url ?? "", icon: "link", variant: "" })) : [],
    contacts: [
      ...(fields.has("email") && row.email ? [{ label: { zh: "邮箱", en: "Email" }, value: { zh: row.email, en: row.email } }] : []),
      ...(fields.has("phone") && row.phone ? [{ label: { zh: "电话", en: "Phone" }, value: { zh: row.phone, en: row.phone } }] : []),
    ],
  };
}

export function createPostgresPublicSiteRepository(pool: Queryable): PublicSiteRepository {
  return {
    async getPageContent(key) {
      const result = await pool.query("SELECT content_json FROM page_content WHERE page_key = $1 LIMIT 1", [key]);
      return result.rows[0]?.content_json ?? null;
    },
    async getResearchItems() {
      const [items, keywords, authors, links] = await Promise.all([
        pool.query("SELECT * FROM research_items ORDER BY sort_order, publication_year DESC NULLS LAST, title_en, id"),
        pool.query("SELECT * FROM research_item_keywords ORDER BY research_item_id, sort_order, id"),
        pool.query("SELECT * FROM research_item_authors ORDER BY research_item_id, sort_order, id"),
        pool.query("SELECT * FROM research_item_links ORDER BY research_item_id, sort_order, id")
      ]);
      const keywordMap = groupBy(keywords.rows, "research_item_id"), authorMap = groupBy(authors.rows, "research_item_id"), linkMap = groupBy(links.rows, "research_item_id");
      return items.rows.map((row) => ({ id: row.id, sortOrder: row.sort_order, title: locale(row, "title"), year: row.publication_year ?? "", venue: locale(row, "venue"), type: row.publication_type, topic: row.topic, image: image(row), pdf: row.pdf_asset_id || row.pdf_src ? { assetId: row.pdf_asset_id ?? "", src: row.pdf_src, label: locale(row, "pdf_label") } : null, keywords: (keywordMap.get(row.id) ?? []).map((item: PublicRecord) => locale(item, "value")), authors: (authorMap.get(row.id) ?? []).map((item: PublicRecord) => ({ name: locale(item, "name"), highlight: item.highlight })), links: (linkMap.get(row.id) ?? []).map((item: PublicRecord) => ({ label: locale(item, "label"), href: item.href, icon: item.icon, variant: item.variant ?? "" })) }));
    },
    async getNewsItems() {
      const { rows } = await pool.query("SELECT * FROM news_items ORDER BY sort_order, title_en, id");
      return rows.map((row) => ({ id: row.id, sortOrder: row.sort_order, date: locale(row, "date"), badge: locale(row, "badge"), badgeTone: row.badge_tone, category: locale(row, "category"), title: locale(row, "title"), description: locale(row, "description"), excerpt: locale(row, "excerpt"), featured: row.featured, image: image(row), link: row.link_href ? { label: locale(row, "link_label"), href: row.link_href, icon: row.link_icon ?? "", variant: row.link_variant ?? "" } : null }));
    },
    async getTeamMembers() {
      const { rows } = await pool.query(`SELECT p.*, u.username, m.url AS avatar_url
        FROM user_profiles p JOIN users u ON u.id=p.user_id
        LEFT JOIN media_assets m ON m.id=p.avatar_asset_id AND m.status='active'
        WHERE p.public_visible=true AND u.account_kind='person'
        ORDER BY p.member_status,p.degree_level,p.enrollment_year,p.name_en,u.username`);
      return rows.map(mapPublicTeamMember);
    },
    async getTeamMemberProfile(slug) {
      const memberResult = await pool.query(`SELECT p.*, u.id AS account_user_id, u.username, m.url AS avatar_url
        FROM user_profiles p JOIN users u ON u.id=p.user_id
        LEFT JOIN media_assets m ON m.id=p.avatar_asset_id AND m.status='active'
        WHERE p.public_visible=true AND u.account_kind='person'
          AND COALESCE(NULLIF(p.member_slug,''),u.username)=$1
        LIMIT 1`, [slug]);
      const row = memberResult.rows[0];
      if (!row) return null;
      const publications = await pool.query(`WITH final_ids AS (
          SELECT DISTINCT COALESCE(work.research_item_id,work.source_snapshot->>'mergedIntoResearchItemId') AS id
          FROM scholarly_work_members member JOIN scholarly_works work ON work.id=member.work_id
          WHERE member.user_id=$1 AND work.decision='accepted'
            AND COALESCE(work.research_item_id,work.source_snapshot->>'mergedIntoResearchItemId') IS NOT NULL
        )
        SELECT item.*,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('name',jsonb_build_object('zh',author.name_zh,'en',author.name_en),'highlight',author.highlight) ORDER BY author.sort_order,author.id) FROM research_item_authors author WHERE author.research_item_id=item.id),'[]'::jsonb) AS public_authors,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('label',jsonb_build_object('zh',link.label_zh,'en',link.label_en),'href',link.href,'icon',link.icon,'variant',COALESCE(link.variant,'')) ORDER BY link.sort_order,link.id) FROM research_item_links link WHERE link.research_item_id=item.id),'[]'::jsonb) AS public_links
        FROM final_ids JOIN research_items item ON item.id=final_ids.id
        ORDER BY item.publication_year DESC NULLS LAST,item.sort_order,item.title_en,item.id`, [row.account_user_id]);
      return {
        member: mapPublicTeamMember(row),
        publications: publications.rows.map((item) => ({
          id: item.id, sortOrder: item.sort_order, title: locale(item, "title"), year: item.publication_year ?? "",
          venue: locale(item, "venue"), type: item.publication_type, topic: item.topic,
          authors: item.public_authors ?? [], links: item.public_links ?? [],
        })),
      };
    },
    async getFacilityItems() {
      const [items, specs] = await Promise.all([pool.query("SELECT * FROM facility_items ORDER BY category_key, sort_order, title_en, id"), pool.query("SELECT * FROM facility_item_specs ORDER BY facility_item_id, sort_order, id")]);
      const specMap = groupBy(specs.rows, "facility_item_id");
      return items.rows.map((row) => ({ id: String(row.id), category: row.category_key, sortOrder: row.sort_order, icon: row.icon, tag: locale(row, "tag"), title: locale(row, "title"), description: locale(row, "description"), specLine: locale(row, "spec_line"), image: image(row), specs: (specMap.get(row.id) ?? []).map((item: PublicRecord) => ({ label: locale(item, "label"), value: locale(item, "value") })) }));
    },
    async getPublicLabPlatforms() {
      const [platforms,specs,components]=await Promise.all([
        pool.query(`SELECT p.id,pt.code category,pt.name_zh category_zh,pt.name_en category_en,pp.title_zh,pp.title_en,pp.description_zh,pp.description_en,pp.tags,pp.component_display_mode,pp.sort_order,m.url image_src FROM lab_platform_public_profiles pp JOIN lab_platforms p ON p.id=pp.platform_id JOIN lab_platform_types pt ON pt.id=p.type_id LEFT JOIN media_assets m ON m.id=pp.image_asset_id AND m.status='active' WHERE pp.public_visible=true ORDER BY pp.sort_order,p.id`),
        pool.query(`SELECT s.platform_id,s.label_zh,s.label_en,s.value_zh,s.value_en,s.unit FROM lab_platform_specs s JOIN lab_platform_public_profiles pp ON pp.platform_id=s.platform_id WHERE pp.public_visible=true AND s.public_visible=true ORDER BY s.platform_id,s.sort_order,s.id`),
        pool.query(`SELECT a.current_platform_id,a.platform_role_zh,a.platform_role_en,dt.name device_type,a.manufacturer,a.model FROM lab_assets a JOIN lab_device_types dt ON dt.id=a.device_type_id JOIN lab_platform_public_profiles pp ON pp.platform_id=a.current_platform_id WHERE pp.public_visible=true AND pp.component_display_mode<>'none' AND a.condition<>'retired' ORDER BY a.current_platform_id,a.platform_sort_order,a.id`),
      ]);
      return platforms.rows.map((row:any)=>{const mode=row.component_display_mode;const raw=components.rows.filter((item:any)=>String(item.current_platform_id)===String(row.id));const publicComponents=mode==="detail"?raw.map((item:any)=>({role:locale(item,"platform_role"),deviceType:item.device_type,manufacturer:item.manufacturer??"",model:item.model??"",count:1})):mode==="summary"?[...raw.reduce((map:Map<string,any>,item:any)=>{const key=[item.device_type,item.manufacturer,item.model].join("\u0000");const current=map.get(key)??{role:{zh:"",en:""},deviceType:item.device_type,manufacturer:item.manufacturer??"",model:item.model??"",count:0};current.count+=1;map.set(key,current);return map},new Map()).values()]:[];return{id:`platform-${row.id}`,category:row.category,categoryLabel:{zh:row.category_zh??row.category,en:row.category_en??row.category},sortOrder:row.sort_order,title:locale(row,"title"),description:locale(row,"description"),tag:{zh:"实验平台",en:"Experimental Platform"},image:row.image_src?{src:row.image_src,alt:row.title_zh||row.title_en}:null,tags:row.tags??[],specs:specs.rows.filter((item:any)=>String(item.platform_id)===String(row.id)).map((item:any)=>({label:locale(item,"label"),value:{zh:`${item.value_zh??""}${item.unit?` ${item.unit}`:""}`,en:`${item.value_en??item.value_zh??""}${item.unit?` ${item.unit}`:""}`}})),components:publicComponents};});
    },
    async getPublicLabAssets() {
      const [assets,specs]=await Promise.all([
        pool.query(`SELECT a.id,dt.code category,dt.name category_name,ap.title_zh,ap.title_en,ap.description_zh,ap.description_en,ap.sort_order,m.url image_src FROM lab_asset_public_profiles ap JOIN lab_assets a ON a.id=ap.asset_id JOIN lab_device_types dt ON dt.id=a.device_type_id LEFT JOIN media_assets m ON m.id=ap.image_asset_id AND m.status='active' WHERE ap.public_visible=true AND a.condition<>'retired' ORDER BY ap.sort_order,a.id`),
        pool.query(`SELECT s.asset_id,s.label_zh,s.label_en,s.value_zh,s.value_en,s.unit FROM lab_asset_specs s JOIN lab_asset_public_profiles ap ON ap.asset_id=s.asset_id WHERE ap.public_visible=true AND s.public_visible=true ORDER BY s.asset_id,s.sort_order,s.id`),
      ]);
      return assets.rows.map((row:any)=>({id:`asset-${row.id}`,category:row.category,categoryLabel:{zh:row.category_name??row.category,en:row.category_name??row.category},sortOrder:row.sort_order,title:locale(row,"title"),description:locale(row,"description"),tag:{zh:"核心设备",en:"Core Equipment"},image:row.image_src?{src:row.image_src,alt:row.title_zh||row.title_en}:null,specs:specs.rows.filter((item:any)=>String(item.asset_id)===String(row.id)).map((item:any)=>({label:locale(item,"label"),value:{zh:`${item.value_zh??""}${item.unit?` ${item.unit}`:""}`,en:`${item.value_en??item.value_zh??""}${item.unit?` ${item.unit}`:""}`}}))}));
    },
    async getContactItems() {
      const [channels, social, cards] = await Promise.all([pool.query("SELECT * FROM contact_primary_channels ORDER BY sort_order, id"), pool.query("SELECT * FROM contact_social_links ORDER BY sort_order, id"), pool.query("SELECT * FROM contact_extra_cards ORDER BY sort_order, id")]);
      return { primaryChannels: channels.rows.map((row) => ({ icon: row.icon, title: locale(row, "title"), value: locale(row, "value"), href: row.href })), socialLinks: social.rows.map((row) => ({ icon: row.icon, label: locale(row, "label"), handle: locale(row, "handle"), href: row.href })), extraCards: cards.rows.map((row) => ({ icon: row.icon, title: locale(row, "title"), description: locale(row, "description"), value: locale(row, "value"), href: row.href, buttonLabel: locale(row, "button_label") })) };
    }
  };
}
