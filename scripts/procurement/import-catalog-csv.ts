import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { parse } from "csv-parse/sync";
import { parseArgs, requiredArg, sha256, writeJson } from "../db/common.js";
import { families, normalizeCatalogRows, type CatalogCsvRow, type CatalogImportItem } from "./catalogCsv.js";

type Queryable = Pick<pg.Client, "query">;

function countBy(items: CatalogImportItem[], key: (item: CatalogImportItem) => string) {
  return Object.fromEntries([...items.reduce((counts, item) => counts.set(key(item), (counts.get(key(item)) ?? 0) + 1), new Map<string, number>())].sort(([left], [right]) => left.localeCompare(right)));
}

export function buildCatalogImportReport(input: string, items: CatalogImportItem[]) {
  return {
    generatedAt: new Date().toISOString(),
    input: resolve(input),
    inputSha256: "",
    rowCount: items.length,
    categories: countBy(items, (item) => item.categoryCode),
    families: countBy(items, (item) => String(item.specMetadata.productFamily)),
    materials: countBy(items, (item) => String(item.specMetadata.material ?? "unknown")),
    missingPrices: items.filter((item) => item.estimatedUnitPrice === null).length,
    uniqueSourceProducts: new Set(items.map((item) => String(item.specMetadata.sourceSku))).size,
    sample: items.slice(0, 10),
  };
}

export async function applyCatalogImport(client: Queryable, items: CatalogImportItem[], options: { insertMissingOnly?: boolean } = {}) {
  const categories = await client.query<{ id: string; code: string }>("SELECT id, code FROM procurement_catalog_categories WHERE code = ANY($1::text[])", [[...new Set(items.map((item) => item.categoryCode))]]);
  const categoryIds = new Map(categories.rows.map((row) => [row.code, row.id]));
  const missing = [...new Set(items.map((item) => item.categoryCode))].filter((code) => !categoryIds.has(code));
  if (missing.length) throw new Error(`Missing catalog categories: ${missing.join(", ")}`);
  await client.query("BEGIN");
  try {
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    for (const item of items) {
      const conflictAction = options.insertMissingOnly
        ? "DO NOTHING"
        : `DO UPDATE SET
          category_id = EXCLUDED.category_id,
          name_zh = EXCLUDED.name_zh,
          name_en = EXCLUDED.name_en,
          spec = EXCLUDED.spec,
          spec_metadata = EXCLUDED.spec_metadata,
          unit = EXCLUDED.unit,
          pack_size = EXCLUDED.pack_size,
          estimated_unit_price = COALESCE(EXCLUDED.estimated_unit_price, procurement_catalog_items.estimated_unit_price),
          vendor = EXCLUDED.vendor,
          url = EXCLUDED.url,
          keywords = EXCLUDED.keywords,
          updated_at = now()`;
      const result = await client.query<{ inserted: boolean }>(`INSERT INTO procurement_catalog_items
        (category_id, sku, name_zh, name_en, spec, spec_metadata, unit, pack_size, estimated_unit_price, vendor, url, keywords, is_active)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true)
        ON CONFLICT (sku) ${conflictAction}
        RETURNING (xmax = 0) AS inserted`, [categoryIds.get(item.categoryCode), item.sku, item.nameZh, item.nameEn, item.spec, item.specMetadata, item.unit, item.packSize, item.estimatedUnitPrice, item.vendor, item.url, item.keywords]);
      if (!result.rows.length) skipped += 1;
      else if (result.rows[0].inserted) inserted += 1;
      else updated += 1;
    }
    await client.query(`INSERT INTO audit_logs (actor_id, action, target_type, target_id, detail)
      VALUES (NULL, 'procurement.catalog.bulk_import', 'procurement_catalog', 'jd-csv', $1::jsonb)`, [JSON.stringify({ rows: items.length, inserted, updated, skipped, insertMissingOnly: Boolean(options.insertMissingOnly), source: "jd" })]);
    await client.query("COMMIT");
    return { inserted, updated, skipped };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function importCatalogCsv({ input, report, databaseUrl, apply, insertMissingOnly = false }: { input: string; report: string; databaseUrl?: string; apply: boolean; insertMissingOnly?: boolean }) {
  const raw = await readFile(resolve(input), "utf8");
  const rows = parse(raw.replace(/^\uFEFF/, ""), { columns: true, skip_empty_lines: true, trim: true }) as CatalogCsvRow[];
  const items = normalizeCatalogRows(rows);
  const summary = { ...buildCatalogImportReport(input, items), inputSha256: sha256(raw) };
  let result: { inserted: number; updated: number; skipped: number } | null = null;
  if (apply) {
    if (!databaseUrl) throw new Error("--database-url or DATABASE_URL is required with --apply");
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try { result = await applyCatalogImport(client, items, { insertMissingOnly }); }
    finally { await client.end(); }
  }
  await writeJson(report, { ...summary, mode: apply ? "applied" : "preview", insertMissingOnly, result });
  return { ...summary, mode: apply ? "applied" : "preview", insertMissingOnly, result, report: resolve(report) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs();
  importCatalogCsv({ input: requiredArg(args, "in"), report: typeof args.get("report") === "string" ? String(args.get("report")) : "outputs/procurement-catalog-import-report.json", databaseUrl: typeof args.get("database-url") === "string" ? String(args.get("database-url")) : process.env.DATABASE_URL, apply: args.has("apply"), insertMissingOnly: args.has("insert-missing") })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => { console.error(error); process.exitCode = 1; });
}
