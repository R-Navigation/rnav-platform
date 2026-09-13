import type { Pool, PoolClient, QueryResult } from "pg";
import { createPostgresPublicSiteRepository } from "../public-site/postgres-repository.js";
import { pageKeys, type ContactItems, type PageKey, type SiteRecord } from "./schemas.js";
import type { PublicSiteRepository } from "../public-site/service.js";
import type { SiteAdminRepository, SiteAdminSnapshot } from "./service.js";

type Queryable = Pick<Pool, "query">;
type TransactionPool = Pick<Pool, "connect" | "query">;
type ErrorWithCleanupFailures = Error & { cleanupFailures?: unknown[] };

export class RevisionConflictError extends Error {
  constructor() {
    super("Content revision conflict");
    this.name = "RevisionConflictError";
  }
}

export class AssetReferenceError extends Error {
  constructor() {
    super("Invalid asset reference");
    this.name = "AssetReferenceError";
  }
}

const value = (input: unknown) => input == null ? "" : String(input);
const number = (input: unknown) => Number.isFinite(Number(input)) ? Number(input) : 0;
const locale = (input: unknown) => {
  const item = input && typeof input === "object" && !Array.isArray(input) ? input as SiteRecord : {};
  return [value(item.zh), value(item.en)] as const;
};
const nested = (input: unknown) => input && typeof input === "object" && !Array.isArray(input) ? input as SiteRecord : {};
const list = (input: unknown) => Array.isArray(input) ? input.map(nested) : [];
const imageValues = (input: unknown) => {
  const item = nested(input);
  return [item.assetId || null, item.src || null, item.alt || null, item.dataAlt || null];
};

async function queryOne<T extends Record<string, unknown>>(queryable: Queryable, sql: string, values?: readonly unknown[]) {
  return (await queryable.query<T>(sql, values ? [...values] : undefined)).rows[0];
}

async function claimRevision(client: PoolClient, moduleKey: string, expected: string) {
  const result = await client.query<{ revision: string }>(
    `UPDATE site_content_revisions
     SET revision = revision + 1, updated_at = now()
     WHERE module_key = $1 AND revision = $2::bigint
     RETURNING revision::text AS revision`,
    [moduleKey, expected]
  );
  if (!result.rowCount) throw new RevisionConflictError();
  return result.rows[0].revision;
}

async function audit(client: PoolClient, actorId: string, action: string, targetType: string, targetId: string, detail: SiteRecord) {
  await client.query(
    `INSERT INTO audit_logs (actor_id, action, target_type, target_id, detail)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [actorId, action, targetType, targetId, JSON.stringify(detail)]
  );
}

async function inReplacementTransaction(
  pool: TransactionPool,
  input: { moduleKey: string; actorId: string; action: string; targetType: string; expected: string; count?: number },
  replace: (client: PoolClient) => Promise<void>
) {
  const client = await pool.connect();
  let primaryError: unknown;
  try {
    await client.query("BEGIN");
    const revision = await claimRevision(client, input.moduleKey, input.expected);
    await replace(client);
    await audit(client, input.actorId, input.action, input.targetType, input.moduleKey, { count: input.count, revision });
    await client.query("COMMIT");
    return revision;
  } catch (error) {
    primaryError = isAssetForeignKeyError(error) ? new AssetReferenceError() : error;
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      attachCleanupFailure(primaryError, rollbackError);
    }
  } finally {
    try {
      client.release();
    } catch (releaseError) {
      if (primaryError === undefined) throw releaseError;
      attachCleanupFailure(primaryError, releaseError);
    }
  }
  throw primaryError;
}

function isAssetForeignKeyError(error: unknown) {
  if (!error || typeof error !== "object" || (error as { code?: unknown }).code !== "23503") return false;
  const constraint = String((error as { constraint?: unknown }).constraint ?? "");
  return /(?:image|pdf)_asset_id|media_assets/i.test(constraint);
}

function attachCleanupFailure(primaryError: unknown, cleanupError: unknown) {
  if (!(primaryError instanceof Error)) return;
  const error = primaryError as ErrorWithCleanupFailures;
  error.cleanupFailures ??= [];
  error.cleanupFailures.push(cleanupError);
}

async function insertMany(client: PoolClient, sql: string, rows: readonly (readonly unknown[])[]) {
  for (const row of rows) await client.query(sql, [...row]);
}

async function getRevisions(pool: Queryable) {
  const result = await pool.query<{ module_key: string; revision: string }>(
    "SELECT module_key, revision::text AS revision FROM site_content_revisions"
  );
  return new Map(result.rows.map((row) => [row.module_key, row.revision]));
}

function normalizeSnapshotAssets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeSnapshotAssets);
  if (!value || typeof value !== "object") return value;
  const result: SiteRecord = {};
  for (const [key, nestedValue] of Object.entries(value as SiteRecord)) {
    result[key] = key === "assetId" && nestedValue === "" ? null : normalizeSnapshotAssets(nestedValue);
  }
  return result;
}

export function createPostgresSiteAdminRepository(
  pool: TransactionPool,
  dependencies: { publicRepositoryFactory?: (queryable: Queryable) => PublicSiteRepository } = {}
): SiteAdminRepository {
  const publicRepositoryFactory = dependencies.publicRepositoryFactory ?? createPostgresPublicSiteRepository;

  const replaceSimpleCollection = (
    moduleKey: string,
    table: string,
    insertSql: string,
    map: (item: SiteRecord, index: number) => readonly unknown[],
    action: string,
    targetType: string
  ) => async (items: SiteRecord[], expected: string, actorId: string) => inReplacementTransaction(
    pool, { moduleKey, actorId, action, targetType, expected, count: items.length },
    async (client) => {
      await client.query(`DELETE FROM ${table}`);
      await insertMany(client, insertSql, items.map(map));
    }
  );

  return {
    async getSnapshot(): Promise<SiteAdminSnapshot> {
      const client = await pool.connect();
      let primaryError: unknown;
      try {
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
        const publicRepository = publicRepositoryFactory(client);
        const [pageRows, revisions, researchItems, newsItems, facilityItems, contactItems] = await Promise.all([
          client.query<{ page_key: string; content_json: unknown }>(
            "SELECT page_key, content_json FROM page_content WHERE page_key = ANY($1::text[])", [pageKeys]
          ),
          getRevisions(client),
          publicRepository.getResearchItems(), publicRepository.getNewsItems(),
          publicRepository.getFacilityItems(), publicRepository.getContactItems()
        ]);
        const storedPages = new Map(pageRows.rows.map((row) => [row.page_key, row.content_json]));
        const pages = Object.fromEntries(pageKeys.map((key) => [key, {
          content: storedPages.get(key) ?? {}, updatedAt: revisions.get(`page:${key}`) ?? "0"
        }]));
        const snapshot = {
          pages,
          researchItems: { items: normalizeSnapshotAssets(researchItems) as SiteRecord[], updatedAt: revisions.get("research-items") ?? "0" },
          newsItems: { items: normalizeSnapshotAssets(newsItems) as SiteRecord[], updatedAt: revisions.get("news-items") ?? "0" },
          facilityItems: { items: normalizeSnapshotAssets(facilityItems) as SiteRecord[], updatedAt: revisions.get("facility-items") ?? "0" },
          contactItems: { items: contactItems, updatedAt: revisions.get("contact-items") ?? "0" }
        };
        await client.query("COMMIT");
        return snapshot;
      } catch (error) {
        primaryError = error;
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          attachCleanupFailure(primaryError, rollbackError);
        }
      } finally {
        try {
          client.release();
        } catch (releaseError) {
          if (primaryError === undefined) throw releaseError;
          attachCleanupFailure(primaryError, releaseError);
        }
      }
      throw primaryError;
    },

    replacePage(pageKey: PageKey, content: unknown, expected: string, actorId: string) {
      return inReplacementTransaction(pool, {
        moduleKey: `page:${pageKey}`, actorId, action: "site.page.update", targetType: "page_content", expected
      }, async (client) => {
        await client.query(
          `INSERT INTO page_content (page_key, content_json, updated_at) VALUES ($1, $2::jsonb, now())
           ON CONFLICT (page_key) DO UPDATE SET content_json = EXCLUDED.content_json, updated_at = now()`,
          [pageKey, JSON.stringify(content)]
        );
      });
    },

    replaceResearchItems(items, expected, actorId) {
      return inReplacementTransaction(pool, { moduleKey: "research-items", actorId, action: "site.research.replace", targetType: "research_items", expected, count: items.length }, async (client) => {
        await client.query("DELETE FROM research_items");
        for (const [index, item] of items.entries()) {
          const [titleZh, titleEn] = locale(item.title), [venueZh, venueEn] = locale(item.venue), [pdfZh, pdfEn] = locale(nested(item.pdf).label);
          await client.query(
            `INSERT INTO research_items (id, sort_order, title_zh, title_en, publication_year, venue_zh, venue_en, publication_type, topic, image_asset_id, image_src, image_alt, image_data_alt, pdf_asset_id, pdf_src, pdf_label_zh, pdf_label_en, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now())`,
            [item.id, number(item.sortOrder ?? index), titleZh, titleEn, item.year === "" || item.year == null ? null : number(item.year), venueZh, venueEn, value(item.type), value(item.topic), ...imageValues(item.image), nested(item.pdf).assetId || null, nested(item.pdf).src || null, pdfZh, pdfEn]
          );
          await insertMany(client, "INSERT INTO research_item_keywords (research_item_id, sort_order, value_zh, value_en) VALUES ($1,$2,$3,$4)", list(item.keywords).map((entry, childIndex) => [item.id, childIndex, ...locale(entry)]));
          await insertMany(client, "INSERT INTO research_item_authors (research_item_id, sort_order, name_zh, name_en, highlight) VALUES ($1,$2,$3,$4,$5)", list(item.authors).map((entry, childIndex) => [item.id, childIndex, ...locale(entry.name), Boolean(entry.highlight)]));
          await insertMany(client, "INSERT INTO research_item_links (research_item_id, sort_order, label_zh, label_en, href, icon, variant) VALUES ($1,$2,$3,$4,$5,$6,$7)", list(item.links).map((entry, childIndex) => [item.id, childIndex, ...locale(entry.label), value(entry.href), value(entry.icon), value(entry.variant)]));
        }
      });
    },

    replaceNewsItems: replaceSimpleCollection("news-items", "news_items",
      `INSERT INTO news_items (id, sort_order, date_zh, date_en, badge_zh, badge_en, badge_tone, category_zh, category_en, title_zh, title_en, description_zh, description_en, excerpt_zh, excerpt_en, featured, image_asset_id, image_src, image_alt, image_data_alt, link_label_zh, link_label_en, link_href, link_icon, link_variant, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,now())`,
      (item, index) => [item.id, number(item.sortOrder ?? index), ...locale(item.date), ...locale(item.badge), value(item.badgeTone || "cyan"), ...locale(item.category), ...locale(item.title), ...locale(item.description), ...locale(item.excerpt), Boolean(item.featured), ...imageValues(item.image), ...locale(nested(item.link).label), nested(item.link).href || null, nested(item.link).icon || null, value(nested(item.link).variant)],
      "site.news.replace", "news_items"),

    replaceFacilityItems(items, expected, actorId) {
      return inReplacementTransaction(pool, { moduleKey: "facility-items", actorId, action: "site.facilities.replace", targetType: "facility_items", expected, count: items.length }, async (client) => {
        await client.query("DELETE FROM facility_items");
        for (const [index, item] of items.entries()) {
          const columns = item.id == null ? "category_key" : "id, category_key";
          const values = [item.category, number(item.sortOrder ?? index), value(item.icon), ...locale(item.tag), ...locale(item.title), ...locale(item.description), ...locale(item.specLine), ...imageValues(item.image)];
          const parameters = values.map((_, valueIndex) => `$${valueIndex + (item.id == null ? 1 : 2)}`).join(",");
          const result = await client.query<{ id: string }>(
            `INSERT INTO facility_items (${columns}, sort_order, icon, tag_zh, tag_en, title_zh, title_en, description_zh, description_en, spec_line_zh, spec_line_en, image_asset_id, image_src, image_alt, image_data_alt, updated_at)
             VALUES (${item.id == null ? "" : "$1,"}${parameters},now()) RETURNING id::text AS id`,
            item.id == null ? values : [item.id, ...values]
          );
          await insertMany(client, "INSERT INTO facility_item_specs (facility_item_id, sort_order, label_zh, label_en, value_zh, value_en) VALUES ($1,$2,$3,$4,$5,$6)", list(item.specs).map((entry, childIndex) => [result.rows[0].id, childIndex, ...locale(entry.label), ...locale(entry.value)]));
        }
      });
    },

    replaceContactItems(items: ContactItems, expected, actorId) {
      return inReplacementTransaction(pool, { moduleKey: "contact-items", actorId, action: "site.contact.replace", targetType: "contact_items", expected, count: items.primaryChannels.length + items.socialLinks.length + items.extraCards.length }, async (client) => {
        await client.query("DELETE FROM contact_primary_channels");
        await client.query("DELETE FROM contact_social_links");
        await client.query("DELETE FROM contact_extra_cards");
        await insertMany(client, "INSERT INTO contact_primary_channels (sort_order, icon, title_zh, title_en, value_zh, value_en, href) VALUES ($1,$2,$3,$4,$5,$6,$7)", items.primaryChannels.map((item, index) => [index, value(item.icon), ...locale(item.title), ...locale(item.value), value(item.href)]));
        await insertMany(client, "INSERT INTO contact_social_links (sort_order, icon, label_zh, label_en, handle_zh, handle_en, href) VALUES ($1,$2,$3,$4,$5,$6,$7)", items.socialLinks.map((item, index) => [index, value(item.icon), ...locale(item.label), ...locale(item.handle), value(item.href)]));
        await insertMany(client, "INSERT INTO contact_extra_cards (sort_order, icon, title_zh, title_en, description_zh, description_en, value_zh, value_en, href, button_label_zh, button_label_en) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", items.extraCards.map((item, index) => [index, value(item.icon), ...locale(item.title), ...locale(item.description), ...locale(item.value), value(item.href), ...locale(item.buttonLabel)]));
      });
    }
  };
}
