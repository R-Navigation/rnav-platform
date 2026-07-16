import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import COS from "cos-nodejs-sdk-v5";
import pg from "pg";
import { parseArgs, requiredArg, writeJson } from "../db/common.js";

type ImageFile = { sourceSku: string; path: string; filename: string; mimeType: string; body: Buffer; checksum: string };
type MediaRow = { id: string; object_key: string; url: string; checksum_sha256: string };
type Queryable = Pick<pg.Client, "query">;
type ObjectStore = { put(key: string, body: Buffer, contentType: string): Promise<void>; delete(key: string): Promise<void> };

const mimeTypes: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

export function normalizeCosPublicBaseUrl(value: string) {
  return value.replace(/\.cos-([a-z0-9-]+)\.myqcloud\.com\/?$/i, ".cos.$1.myqcloud.com").replace(/\/$/, "");
}

export async function loadCatalogImages(directory: string): Promise<ImageFile[]> {
  const root = resolve(directory);
  const files = await readdir(root, { withFileTypes: true });
  const images: ImageFile[] = [];
  for (const file of files) {
    if (!file.isFile()) continue;
    const extension = extname(file.name).toLowerCase();
    const mimeType = mimeTypes[extension];
    if (!mimeType) continue;
    const sourceSku = file.name.match(/^(\d+)(?:_|\.)/)?.[1];
    if (!sourceSku) throw new Error(`Image filename must start with a numeric source SKU: ${file.name}`);
    const path = resolve(root, file.name); const body = await readFile(path);
    images.push({ sourceSku, path, filename: file.name, mimeType, body, checksum: createHash("sha256").update(body).digest("hex") });
  }
  const duplicate = images.find((image, index) => images.findIndex((candidate) => candidate.sourceSku === image.sourceSku) !== index);
  if (duplicate) throw new Error(`Duplicate source SKU image: ${duplicate.sourceSku}`);
  if (!images.length) throw new Error("No supported catalog images found");
  return images.sort((left, right) => left.sourceSku.localeCompare(right.sourceSku));
}

export async function applyCatalogImages(client: Queryable, store: ObjectStore, images: ImageFile[], options: { publicBaseUrl: string; pathPrefix: string }) {
  const publicBaseUrl = normalizeCosPublicBaseUrl(options.publicBaseUrl);
  const sourceSkus = images.map((image) => image.sourceSku);
  const counts = await client.query<{ source_sku: string; count: number }>(`SELECT spec_metadata->>'sourceSku' AS source_sku, count(*)::integer AS count
    FROM procurement_catalog_items WHERE spec_metadata->>'sourceSku' = ANY($1::text[])
    GROUP BY spec_metadata->>'sourceSku'`, [sourceSkus]);
  const countBySku = new Map(counts.rows.map((row) => [row.source_sku, Number(row.count)]));
  const missing = sourceSkus.filter((sourceSku) => !countBySku.has(sourceSku));
  if (missing.length) throw new Error(`No catalog items found for source SKU: ${missing.join(", ")}`);

  const uploadedKeys: string[] = [];
  await client.query("BEGIN");
  try {
    const results: Array<{ sourceSku: string; mediaAssetId: string; itemsMatched: number; itemsUpdated: number; recycledOldAssets: number; reused: boolean }> = [];
    for (const image of images) {
      const objectKey = `${options.pathPrefix.replace(/\/$/, "")}/procurement/catalog/${image.sourceSku}-${image.checksum.slice(0, 12)}${extname(image.filename).toLowerCase()}`;
      const existing = await client.query<MediaRow>("SELECT id,object_key,url,checksum_sha256 FROM media_assets WHERE object_key=$1", [objectKey]);
      let media = existing.rows[0]; let reused = Boolean(media);
      if (!media) {
        const id = randomUUID(); const url = `${publicBaseUrl}/${objectKey}`;
        await store.put(objectKey, image.body, image.mimeType); uploadedKeys.push(objectKey);
        media = (await client.query<MediaRow>(`INSERT INTO media_assets(id,bucket,filename,object_key,url,mime_type,size_bytes,checksum_sha256,status)
          VALUES($1,'procurement',$2,$3,$4,$5,$6,$7,'active') RETURNING id,object_key,url,checksum_sha256`, [id, image.filename, objectKey, url, image.mimeType, image.body.length, image.checksum])).rows[0];
      } else {
        await client.query("UPDATE media_assets SET status='active',recycled_at=NULL,delete_error=NULL,updated_at=now() WHERE id=$1 AND status<>'active'", [media.id]);
      }
      const oldAssets = await client.query<{ id: string }>("SELECT DISTINCT image_asset_id AS id FROM procurement_catalog_items WHERE spec_metadata->>'sourceSku'=$1 AND image_asset_id IS NOT NULL AND image_asset_id<>$2", [image.sourceSku, media.id]);
      const updated = await client.query("UPDATE procurement_catalog_items SET image_asset_id=$2,updated_at=now() WHERE spec_metadata->>'sourceSku'=$1 AND image_asset_id IS DISTINCT FROM $2", [image.sourceSku, media.id]);
      let recycledOldAssets = 0;
      for (const oldAsset of oldAssets.rows) {
        const recycled = await client.query(`UPDATE media_assets SET status='recycled',recycled_at=now(),updated_at=now()
          WHERE id=$1 AND status='active'
            AND NOT EXISTS (SELECT 1 FROM user_profiles WHERE avatar_asset_id=$1)
            AND NOT EXISTS (SELECT 1 FROM research_items WHERE image_asset_id=$1 OR pdf_asset_id=$1)
            AND NOT EXISTS (SELECT 1 FROM news_items WHERE image_asset_id=$1)
            AND NOT EXISTS (SELECT 1 FROM team_members WHERE image_asset_id=$1)
            AND NOT EXISTS (SELECT 1 FROM facility_items WHERE image_asset_id=$1)
            AND NOT EXISTS (SELECT 1 FROM procurement_catalog_items WHERE image_asset_id=$1)
            AND NOT EXISTS (SELECT 1 FROM page_content WHERE content_json::text LIKE '%' || $1::text || '%')`, [oldAsset.id]);
        recycledOldAssets += recycled.rowCount ?? 0;
      }
      results.push({ sourceSku: image.sourceSku, mediaAssetId: media.id, itemsMatched: countBySku.get(image.sourceSku) ?? 0, itemsUpdated: updated.rowCount ?? 0, recycledOldAssets, reused });
    }
    await client.query(`INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail)
      VALUES(NULL,'procurement.catalog_images.bulk_import','procurement_catalog','jd-images',$1::jsonb)`, [JSON.stringify({ images: images.length, sourceSkus, matchedItems: results.reduce((sum, result) => sum + result.itemsMatched, 0), linkedItems: results.reduce((sum, result) => sum + result.itemsUpdated, 0), recycledOldAssets: results.reduce((sum, result) => sum + result.recycledOldAssets, 0) })]);
    await client.query("COMMIT");
    return results;
  } catch (error) {
    await client.query("ROLLBACK");
    await Promise.allSettled(uploadedKeys.map((key) => store.delete(key)));
    throw error;
  }
}

function createStore(options: { secretId: string; secretKey: string; region: string; bucket: string }): ObjectStore {
  const cos = new COS({ SecretId: options.secretId, SecretKey: options.secretKey });
  return {
    put: (key, body, contentType) => new Promise((resolvePromise, reject) => cos.putObject({ Bucket: options.bucket, Region: options.region, Key: key, Body: body, ContentType: contentType }, (error) => error ? reject(error) : resolvePromise())),
    delete: (key) => new Promise((resolvePromise, reject) => cos.deleteObject({ Bucket: options.bucket, Region: options.region, Key: key }, (error) => error ? reject(error) : resolvePromise())),
  };
}

export async function importCatalogImages(input: { directory: string; databaseUrl: string; publicBaseUrl: string; pathPrefix: string; secretId: string; secretKey: string; region: string; bucket: string; report: string; apply: boolean }) {
  const images = await loadCatalogImages(input.directory);
  let result: Awaited<ReturnType<typeof applyCatalogImages>> | null = null;
  if (input.apply) {
    const client = new pg.Client({ connectionString: input.databaseUrl }); await client.connect();
    try { result = await applyCatalogImages(client, createStore(input), images, input); } finally { await client.end(); }
  }
  const report = { generatedAt: new Date().toISOString(), directory: resolve(input.directory), mode: input.apply ? "applied" : "preview", images: images.map(({ sourceSku, path, filename, mimeType, body, checksum }) => ({ sourceSku, path, filename, mimeType, sizeBytes: body.length, checksum })), result };
  await writeJson(input.report, report); return { ...report, report: resolve(input.report) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(); const apply = args.has("apply");
  const env = (name: string) => process.env[name] ?? "";
  importCatalogImages({ directory: requiredArg(args, "dir"), report: typeof args.get("report") === "string" ? String(args.get("report")) : "outputs/procurement-catalog-images-report.json", apply,
    databaseUrl: typeof args.get("database-url") === "string" ? String(args.get("database-url")) : env("DATABASE_URL"), publicBaseUrl: env("COS_PUBLIC_BASE_URL"), pathPrefix: env("COS_PATH_PREFIX") || "rnav",
    secretId: env("COS_SECRET_ID"), secretKey: env("COS_SECRET_KEY"), region: env("COS_REGION"), bucket: env("COS_BUCKET") })
    .then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error); process.exitCode = 1; });
}
