import type { Pool } from "pg";
import type { PublicRecord, PublicSiteRepository } from "./service.js";

export type Queryable = Pick<Pool, "query">;

const locale = (row: PublicRecord, prefix: string) => ({ zh: row[`${prefix}_zh`] ?? "", en: row[`${prefix}_en`] ?? "" });
const image = (row: PublicRecord) => row.image_asset_id || row.image_src ? { assetId: row.image_asset_id ?? "", src: row.image_src, alt: row.image_alt ?? "", dataAlt: row.image_data_alt ?? "" } : null;
const groupBy = (rows: PublicRecord[], key: string) => rows.reduce((map, row) => map.set(row[key], [...(map.get(row[key]) ?? []), row]), new Map<unknown, PublicRecord[]>());

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
      return rows.map((row) => ({ id: row.id, sortOrder: row.sort_order, date: locale(row, "date"), badge: locale(row, "badge"), badgeTone: row.badge_tone, title: locale(row, "title"), description: locale(row, "description"), excerpt: locale(row, "excerpt"), featured: row.featured, image: image(row), link: row.link_href ? { label: locale(row, "link_label"), href: row.link_href, icon: row.link_icon ?? "", variant: row.link_variant ?? "" } : null }));
    },
    async getTeamMembers() {
      const { rows } = await pool.query(`SELECT p.*, u.username, m.url AS avatar_url
        FROM user_profiles p JOIN users u ON u.id=p.user_id
        LEFT JOIN media_assets m ON m.id=p.avatar_asset_id AND m.status='active'
        WHERE p.public_visible=true
        ORDER BY p.member_status,p.member_category,p.enrollment_year,p.name_en,u.username`);
      return rows.map((row) => {
        const fields = new Set<string>(row.public_fields ?? []);
        const alumni = row.member_status === "alumni";
        const degreeZh = row.degree_level === "phd" ? "博士" : row.degree_level === "master" ? "硕士" : row.degree_level === "undergrad" ? "本科" : row.degree_level === "postdoc" ? "博士后" : row.degree_level === "faculty" ? "教师" : "";
        const degreeEn = row.degree_level === "phd" ? "PhD" : row.degree_level === "master" ? "Master" : row.degree_level === "undergrad" ? "Bachelor" : row.degree_level === "postdoc" ? "Postdoctoral" : row.degree_level === "faculty" ? "Faculty" : "";
        const year = alumni ? row.graduation_year : row.enrollment_year;
        return {
          slug: row.member_slug || row.username,
          group: alumni ? "alumni" : row.degree_level === "faculty" ? "advisor" : row.degree_level || row.member_category,
          sortOrder: 0,
          name: { zh: fields.has("name_zh") ? row.name_zh : "", en: fields.has("name_en") ? row.name_en : "" },
          bio: fields.has("bio") ? locale(row, "bio") : { zh: "", en: "" },
          degree: fields.has("academic") && !alumni ? { zh: year && degreeZh ? `${year}级${degreeZh}` : degreeZh, en: year && degreeEn ? `${degreeEn}, Class of ${year}` : degreeEn } : { zh: "", en: "" },
          enrollmentYear: fields.has("academic") && !alumni ? { zh: row.enrollment_year, en: row.enrollment_year } : { zh: "", en: "" },
          graduation: fields.has("academic") && alumni ? { zh: year && degreeZh ? `${year}届${degreeZh}` : degreeZh, en: year && degreeEn ? `${degreeEn}, Graduated ${year}` : degreeEn } : { zh: "", en: "" },
          major: fields.has("major") ? locale(row, "major") : { zh: "", en: "" },
          research: fields.has("research") ? { zh: row.research_interests_zh, en: row.research_interests_en } : { zh: "", en: "" },
          thesis: fields.has("thesis") && alumni ? locale(row, "thesis") : { zh: "", en: "" },
          destination: fields.has("destination") && alumni ? locale(row, "destination") : { zh: "", en: "" },
          image: fields.has("avatar") && row.avatar_url ? { assetId: row.avatar_asset_id, src: row.avatar_url, alt: row.name_zh || row.name_en, positionX: row.avatar_position_x, positionY: row.avatar_position_y, zoom: Number(row.avatar_zoom) } : null,
          links: fields.has("links") && Array.isArray(row.personal_links) ? row.personal_links.map((link: any) => ({ label: { zh: link.labelZh ?? "", en: link.labelEn ?? "" }, href: link.url ?? "", icon: "link", variant: "" })) : [],
          contacts: fields.has("email") && row.email ? [{ label: { zh: "邮箱", en: "Email" }, value: { zh: row.email, en: row.email } }] : [],
        };
      });
    },
    async getFacilityItems() {
      const [items, specs] = await Promise.all([pool.query("SELECT * FROM facility_items ORDER BY category_key, sort_order, title_en, id"), pool.query("SELECT * FROM facility_item_specs ORDER BY facility_item_id, sort_order, id")]);
      const specMap = groupBy(specs.rows, "facility_item_id");
      return items.rows.map((row) => ({ id: String(row.id), category: row.category_key, sortOrder: row.sort_order, icon: row.icon, tag: locale(row, "tag"), title: locale(row, "title"), description: locale(row, "description"), specLine: locale(row, "spec_line"), image: image(row), specs: (specMap.get(row.id) ?? []).map((item: PublicRecord) => ({ label: locale(item, "label"), value: locale(item, "value") })) }));
    },
    async getContactItems() {
      const [channels, social, cards] = await Promise.all([pool.query("SELECT * FROM contact_primary_channels ORDER BY sort_order, id"), pool.query("SELECT * FROM contact_social_links ORDER BY sort_order, id"), pool.query("SELECT * FROM contact_extra_cards ORDER BY sort_order, id")]);
      return { primaryChannels: channels.rows.map((row) => ({ icon: row.icon, title: locale(row, "title"), value: locale(row, "value"), href: row.href })), socialLinks: social.rows.map((row) => ({ icon: row.icon, label: locale(row, "label"), handle: locale(row, "handle"), href: row.href })), extraCards: cards.rows.map((row) => ({ title: locale(row, "title"), description: locale(row, "description"), value: locale(row, "value") })) };
    }
  };
}
