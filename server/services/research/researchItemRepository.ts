import type { PoolClient } from "pg";
import type { SiteRecord } from "../site-admin/schemas.js";

type ResearchClient = Pick<PoolClient, "query">;

const value = (input: unknown) => input == null ? "" : String(input);
const number = (input: unknown) => Number.isFinite(Number(input)) ? Number(input) : 0;
const nested = (input: unknown) => input && typeof input === "object" && !Array.isArray(input) ? input as SiteRecord : {};
const list = (input: unknown) => Array.isArray(input) ? input.map(nested) : [];
const locale = (input: unknown) => {
  const item = nested(input);
  return [value(item.zh), value(item.en)] as const;
};
const imageValues = (input: unknown) => {
  const item = nested(input);
  return [item.assetId || null, item.src || null, item.alt || null, item.dataAlt || null];
};

async function insertMany(client: ResearchClient, sql: string, rows: readonly (readonly unknown[])[]) {
  for (const row of rows) await client.query(sql, [...row]);
}

export async function upsertResearchItem(client: ResearchClient, item: SiteRecord, fallbackSortOrder = 0) {
  const [titleZh, titleEn] = locale(item.title);
  const [venueZh, venueEn] = locale(item.venue);
  const [pdfZh, pdfEn] = locale(nested(item.pdf).label);
  await client.query(
    `INSERT INTO research_items (
      id, sort_order, title_zh, title_en, publication_year, venue_zh, venue_en,
      publication_type, topic, image_asset_id, image_src, image_alt, image_data_alt,
      pdf_asset_id, pdf_src, pdf_label_zh, pdf_label_en, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now())
    ON CONFLICT (id) DO UPDATE SET
      sort_order=EXCLUDED.sort_order, title_zh=EXCLUDED.title_zh, title_en=EXCLUDED.title_en,
      publication_year=EXCLUDED.publication_year, venue_zh=EXCLUDED.venue_zh,
      venue_en=EXCLUDED.venue_en, publication_type=EXCLUDED.publication_type,
      topic=EXCLUDED.topic, image_asset_id=EXCLUDED.image_asset_id, image_src=EXCLUDED.image_src,
      image_alt=EXCLUDED.image_alt, image_data_alt=EXCLUDED.image_data_alt,
      pdf_asset_id=EXCLUDED.pdf_asset_id, pdf_src=EXCLUDED.pdf_src,
      pdf_label_zh=EXCLUDED.pdf_label_zh, pdf_label_en=EXCLUDED.pdf_label_en,
      updated_at=now()`,
    [
      item.id, number(item.sortOrder ?? fallbackSortOrder), titleZh, titleEn,
      item.year === "" || item.year == null ? null : number(item.year), venueZh, venueEn,
      value(item.type), value(item.topic), ...imageValues(item.image),
      nested(item.pdf).assetId || null, nested(item.pdf).src || null, pdfZh, pdfEn,
    ],
  );

  await client.query("DELETE FROM research_item_keywords WHERE research_item_id=$1", [item.id]);
  await client.query("DELETE FROM research_item_authors WHERE research_item_id=$1", [item.id]);
  await client.query("DELETE FROM research_item_links WHERE research_item_id=$1", [item.id]);
  await insertMany(client,
    "INSERT INTO research_item_keywords (research_item_id, sort_order, value_zh, value_en) VALUES ($1,$2,$3,$4)",
    list(item.keywords).map((entry, index) => [item.id, index, ...locale(entry)]),
  );
  await insertMany(client,
    "INSERT INTO research_item_authors (research_item_id, sort_order, name_zh, name_en, highlight) VALUES ($1,$2,$3,$4,$5)",
    list(item.authors).map((entry, index) => [item.id, index, ...locale(entry.name), Boolean(entry.highlight)]),
  );
  await insertMany(client,
    "INSERT INTO research_item_links (research_item_id, sort_order, label_zh, label_en, href, icon, variant) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    list(item.links).map((entry, index) => [item.id, index, ...locale(entry.label), value(entry.href), value(entry.icon), value(entry.variant)]),
  );
}

export async function replaceResearchItemCollection(
  client: ResearchClient,
  items: SiteRecord[],
  actorId: string,
) {
  const incomingIds = items.map((item) => String(item.id));
  const existing = await client.query<{ id: string }>("SELECT id FROM research_items FOR UPDATE");
  const removedIds = existing.rows.map((row) => row.id).filter((id) => !incomingIds.includes(id));

  for (const [index, item] of items.entries()) {
    await releaseManuallyEditedFields(client, item);
    await upsertResearchItem(client, item, index);
  }

  if (removedIds.length) {
    await client.query(
      `UPDATE scholarly_works
       SET decision='ignored', research_item_id=NULL, reviewed_at=now(), reviewed_by=$2,
           version=version+1
       WHERE source_type='openalex' AND research_item_id=ANY($1::text[])`,
      [removedIds, actorId],
    );
    await client.query("DELETE FROM research_items WHERE id=ANY($1::text[])", [removedIds]);
  }
  return { removedIds };
}

async function releaseManuallyEditedFields(client: ResearchClient, item: SiteRecord) {
  const result = await client.query<{ id: string; managed_fields: string[]; normalized: SiteRecord }>(
    `SELECT id, managed_fields, COALESCE(source_snapshot->'normalized','{}'::jsonb) normalized
     FROM scholarly_works
     WHERE source_type='openalex' AND decision='accepted' AND research_item_id=$1
     FOR UPDATE`,
    [item.id],
  );
  const work = result.rows[0];
  if (!work?.managed_fields.length) return;
  const normalized = work.normalized ?? {};
  const links = list(item.links);
  const providerLinks = [normalized.doiUrl, normalized.arxivUrl, normalized.landingPageUrl].filter(Boolean).map(String);
  const changed = new Set<string>();
  if (value(nested(item.title).en) !== value(normalized.title)) changed.add("title_en");
  if ((item.year == null || item.year === "" ? null : number(item.year)) !== (normalized.year ?? null)) changed.add("year");
  if (value(nested(item.venue).en) !== value(normalized.venue)) changed.add("venue_en");
  if (value(item.type) !== value(normalized.mappedType)) changed.add("type");
  const doiHref = links.find((link) => value(link.icon).toLowerCase() === "doi")?.href;
  if (value(doiHref) !== value(normalized.doiUrl)) changed.add("doi_link");
  const externalHrefs = links.filter((link) => value(link.icon).toLowerCase() !== "doi").map((link) => value(link.href)).filter(Boolean);
  const expectedExternal = providerLinks.filter((href) => href !== normalized.doiUrl);
  if (JSON.stringify(externalHrefs) !== JSON.stringify(expectedExternal)) changed.add("external_links");
  const next = work.managed_fields.filter((field) => !changed.has(field));
  if (next.length !== work.managed_fields.length) {
    await client.query("UPDATE scholarly_works SET managed_fields=$2,version=version+1 WHERE id=$1", [work.id, next]);
  }
}

export function stableResearchItemId(openAlexWorkId: string) {
  const normalized = openAlexWorkId.trim().toLowerCase().replace(/^https?:\/\/openalex\.org\//, "");
  return `openalex-${normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}
