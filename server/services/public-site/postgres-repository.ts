import type { Pool } from "pg";
import type { PublicRecord, PublicSiteRepository } from "./service.js";

export type Queryable = Pick<Pool, "query">;

const locale = (row: PublicRecord, prefix: string) => ({ zh: row[`${prefix}_zh`] ?? "", en: row[`${prefix}_en`] ?? "" });
const image = (row: PublicRecord) => row.image_src ? { assetId: row.image_asset_id ?? "", src: row.image_src, alt: row.image_alt ?? "", dataAlt: row.image_data_alt ?? "" } : null;
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
      return items.rows.map((row) => ({ id: row.id, sortOrder: row.sort_order, title: locale(row, "title"), year: row.publication_year ?? "", venue: locale(row, "venue"), type: row.publication_type, topic: row.topic, image: image(row), pdf: row.pdf_src ? { assetId: row.pdf_asset_id ?? "", src: row.pdf_src, label: locale(row, "pdf_label") } : null, keywords: (keywordMap.get(row.id) ?? []).map((item: PublicRecord) => locale(item, "value")), authors: (authorMap.get(row.id) ?? []).map((item: PublicRecord) => ({ name: locale(item, "name"), highlight: item.highlight })), links: (linkMap.get(row.id) ?? []).map((item: PublicRecord) => ({ label: locale(item, "label"), href: item.href, icon: item.icon, variant: item.variant ?? "" })) }));
    },
    async getNewsItems() {
      const { rows } = await pool.query("SELECT * FROM news_items ORDER BY sort_order, title_en, id");
      return rows.map((row) => ({ id: row.id, sortOrder: row.sort_order, date: locale(row, "date"), badge: locale(row, "badge"), badgeTone: row.badge_tone, title: locale(row, "title"), description: locale(row, "description"), excerpt: locale(row, "excerpt"), featured: row.featured, image: image(row), link: row.link_href ? { label: locale(row, "link_label"), href: row.link_href, icon: row.link_icon ?? "" } : null }));
    },
    async getTeamMembers() {
      const [members, links, contacts] = await Promise.all([pool.query("SELECT * FROM team_members ORDER BY group_key, sort_order, name_en, id"), pool.query("SELECT * FROM team_member_links ORDER BY team_member_id, sort_order, id"), pool.query("SELECT * FROM team_member_contacts ORDER BY team_member_id, sort_order, id")]);
      const linkMap = groupBy(links.rows, "team_member_id"), contactMap = groupBy(contacts.rows, "team_member_id");
      return members.rows.map((row) => ({ slug: row.slug, group: row.group_key, sortOrder: row.sort_order, name: locale(row, "name"), subtitle: locale(row, "subtitle"), bio: locale(row, "bio"), role: locale(row, "role"), focus: locale(row, "focus"), degree: locale(row, "degree"), enrollmentYear: row.enrollment_year ?? "", major: locale(row, "major"), research: locale(row, "research"), graduation: locale(row, "graduation"), thesis: locale(row, "thesis"), destination: locale(row, "destination"), image: image(row), links: (linkMap.get(row.id) ?? []).map((item: PublicRecord) => ({ label: locale(item, "label"), href: item.href, icon: item.icon, variant: item.variant ?? "" })), contacts: (contactMap.get(row.id) ?? []).map((item: PublicRecord) => ({ label: locale(item, "label"), value: { zh: item.value_zh ?? item.value_text ?? "", en: item.value_en ?? item.value_text ?? "" } })) }));
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
