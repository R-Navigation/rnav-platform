import type { Pool, PoolClient } from "pg";
import type { LabAsset, LabNote, LabPlatform, LabPlatformType, LocalizedText } from "./schemas.js";

type TransactionPool = Pick<Pool, "connect">;
type LabAssetSnapshotItem = LabAsset & { notes: LabNoteSnapshot[] };
type LabNoteSnapshot = LabNote & { id: string };
type LabPlatformSnapshotItem = LabPlatform & {
  assetCodes?: string[];
  assetCount?: number;
  notes?: LabNoteSnapshot[];
};
type LabPlatformTypeSnapshotItem = LabPlatformType & { platforms: LabPlatformSnapshotItem[] };
type LabAssetsSnapshot = {
  assets: LabAssetSnapshotItem[];
  page: Record<string, unknown>;
  platforms: LabPlatformSnapshotItem[];
  platformTypes: LabPlatformTypeSnapshotItem[];
  revision: string;
  stats: Record<string, number>;
};
type Dependencies = { getSnapshot?: () => Promise<LabAssetsSnapshot> };
type AuditInput = { actorId: string; action: string; targetType: string; targetId: string; revision: string };
type ErrorWithCleanupFailures = Error & { cleanupFailures?: unknown[] };

type PlatformTypeRow = {
  code: string; sort_order: number; name_zh: string; name_en: string; description_zh: string; description_en: string;
};
type PlatformRow = PlatformTypeRow & { type_code: string | null; status: LabPlatform["status"] };
type AssetRow = {
  code: string; device_type_zh: string; device_type_en: string; model: string; name_zh: string; name_en: string;
  description_zh: string; description_en: string; vendor_serial: string; status: LabAsset["status"];
  current_platform_code: string | null; share_scope: string; sort_order: number;
};
type NoteRow = { id: string; sort_order: number; content_zh: string; content_en: string };
type PlatformNoteRow = NoteRow & { platform_code: string };
type AssetNoteRow = NoteRow & { asset_code: string };

export type { LabAsset, LabNote, LabPlatform, LabPlatformType } from "./schemas.js";

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class RevisionConflictError extends Error {
  constructor() {
    super("Lab assets revision conflict");
    this.name = "RevisionConflictError";
  }
}

function localized(zh: string, en: string): LocalizedText {
  return { zh: zh ?? "", en: en ?? "" };
}

function attachCleanupFailure(primaryError: unknown, cleanupError: unknown) {
  if (!(primaryError instanceof Error)) return;
  const error = primaryError as ErrorWithCleanupFailures;
  error.cleanupFailures ??= [];
  error.cleanupFailures.push(cleanupError);
}

async function claimRevision(client: PoolClient, expectedRevision: string) {
  const result = await client.query<{ revision: string }>(
    `UPDATE site_content_revisions
     SET revision = revision + 1, updated_at = now()
     WHERE module_key = $1 AND revision = $2::bigint
     RETURNING revision::text AS revision`,
    ["lab-assets", expectedRevision],
  );
  if (!result.rowCount) throw new RevisionConflictError();
  return result.rows[0].revision;
}

async function writeAudit(client: PoolClient, input: AuditInput) {
  await client.query(
    `INSERT INTO audit_logs (actor_id, action, target_type, target_id, detail)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [input.actorId, input.action, input.targetType, input.targetId, JSON.stringify({ revision: input.revision })],
  );
}

function buildSnapshot(
  page: Record<string, unknown>, revision: string, typeRows: PlatformTypeRow[], platformRows: PlatformRow[],
  assetRows: AssetRow[], platformNoteRows: PlatformNoteRow[], assetNoteRows: AssetNoteRow[],
): LabAssetsSnapshot {
  const platformNotes = new Map<string, LabNoteSnapshot[]>();
  for (const row of platformNoteRows) {
    const notes = platformNotes.get(row.platform_code) ?? [];
    notes.push({ id: String(row.id), sortOrder: row.sort_order, content: localized(row.content_zh, row.content_en) });
    platformNotes.set(row.platform_code, notes);
  }
  const assetNotes = new Map<string, LabNoteSnapshot[]>();
  for (const row of assetNoteRows) {
    const notes = assetNotes.get(row.asset_code) ?? [];
    notes.push({ id: String(row.id), sortOrder: row.sort_order, content: localized(row.content_zh, row.content_en) });
    assetNotes.set(row.asset_code, notes);
  }

  const assets: LabAssetSnapshotItem[] = assetRows.map((row) => ({
    code: row.code,
    currentPlatformCode: row.current_platform_code,
    description: localized(row.description_zh, row.description_en),
    deviceType: localized(row.device_type_zh, row.device_type_en),
    model: row.model ?? "",
    name: localized(row.name_zh, row.name_en),
    notes: assetNotes.get(row.code) ?? [],
    shareScope: row.share_scope,
    sortOrder: row.sort_order,
    status: row.status,
    vendorSerial: row.vendor_serial ?? "",
  }));
  const assetsByPlatform = new Map<string, string[]>();
  for (const asset of assets) {
    if (!asset.currentPlatformCode) continue;
    const codes = assetsByPlatform.get(asset.currentPlatformCode) ?? [];
    codes.push(asset.code);
    assetsByPlatform.set(asset.currentPlatformCode, codes);
  }
  const platforms: LabPlatformSnapshotItem[] = platformRows.map((row) => {
    const assetCodes = assetsByPlatform.get(row.code) ?? [];
    return {
      assetCodes,
      assetCount: assetCodes.length,
      code: row.code,
      description: localized(row.description_zh, row.description_en),
      name: localized(row.name_zh, row.name_en),
      notes: platformNotes.get(row.code) ?? [],
      sortOrder: row.sort_order,
      status: row.status,
      typeCode: row.type_code,
    };
  });
  const grouped = new Map<string, LabPlatformTypeSnapshotItem>();
  for (const row of typeRows) {
    grouped.set(row.code, {
      code: row.code,
      description: localized(row.description_zh, row.description_en),
      name: localized(row.name_zh, row.name_en),
      platforms: [],
      sortOrder: row.sort_order,
    });
  }
  const uncategorized: LabPlatformTypeSnapshotItem = {
    code: "uncategorized", description: localized("", ""), name: localized("未分类平台", "Uncategorized Platforms"),
    platforms: [], sortOrder: Number.MAX_SAFE_INTEGER,
  };
  for (const platform of platforms) (platform.typeCode ? grouped.get(platform.typeCode) : undefined)?.platforms.push(platform)
    ?? uncategorized.platforms.push(platform);
  const platformTypes = [...grouped.values()];
  if (uncategorized.platforms.length) platformTypes.push(uncategorized);
  const countPlatforms = (status: LabPlatform["status"]) => platforms.filter((item) => item.status === status).length;
  const countAssets = (status: LabAsset["status"]) => assets.filter((item) => item.status === status).length;

  return {
    assets,
    page,
    platforms,
    platformTypes,
    revision,
    stats: {
      activePlatforms: countPlatforms("active"),
      emptyPlatforms: countPlatforms("empty"),
      idleAssets: assets.filter((item) => item.status === "idle" && !item.currentPlatformCode).length,
      lendAssets: countAssets("lend"),
      lendPlatforms: countPlatforms("lend"),
      maintenanceAssets: countAssets("maintenance"),
      maintenancePlatforms: countPlatforms("maintenance"),
      mountedAssets: assets.filter((item) => Boolean(item.currentPlatformCode) || item.status === "mounted").length,
      partialPlatforms: countPlatforms("partial"),
      retiredAssets: countAssets("retired"),
      sharedAssets: countAssets("lend"),
      totalAssets: assets.length,
      totalPlatforms: platforms.length,
    },
  };
}

export function createLabAssetsService(pool: TransactionPool, dependencies: Dependencies = {}) {
  async function mutate(
    input: Omit<AuditInput, "revision"> & { expectedRevision: string },
    write: (client: PoolClient) => Promise<void>,
  ) {
    const client = await pool.connect();
    let primaryError: unknown;
    try {
      await client.query("BEGIN");
      const revision = await claimRevision(client, input.expectedRevision);
      await write(client);
      await writeAudit(client, { ...input, revision });
      await client.query("COMMIT");
      return revision;
    } catch (error) {
      primaryError = error;
      try { await client.query("ROLLBACK"); } catch (rollbackError) { attachCleanupFailure(primaryError, rollbackError); }
    } finally {
      try { client.release(); } catch (releaseError) {
        if (primaryError === undefined) throw releaseError;
        attachCleanupFailure(primaryError, releaseError);
      }
    }
    throw primaryError;
  }

  async function findPlatformId(client: PoolClient, code: string | null) {
    if (code === null) return null;
    const result = await client.query<{ id: string }>("SELECT id FROM lab_platforms WHERE code = $1 LIMIT 1", [code]);
    if (!result.rowCount) throw new ConflictError("Platform not found");
    return result.rows[0].id;
  }

  async function findPlatformTypeId(client: PoolClient, code: string | null) {
    if (code === null) return null;
    const result = await client.query<{ id: string }>("SELECT id FROM lab_platform_types WHERE code = $1 LIMIT 1", [code]);
    if (!result.rowCount) throw new ConflictError("Platform type not found");
    return result.rows[0].id;
  }

  async function getSnapshot(): Promise<LabAssetsSnapshot> {
    const client = await pool.connect();
    let primaryError: unknown;
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const [pageResult, revisionResult, types, platforms, assets, platformNotes, assetNotes] = await Promise.all([
        client.query<{ content_json: Record<string, unknown> }>("SELECT content_json FROM page_content WHERE page_key = $1 LIMIT 1", ["lab_assets_page"]),
        client.query<{ revision: string }>("SELECT revision::text AS revision FROM site_content_revisions WHERE module_key = $1", ["lab-assets"]),
        client.query<PlatformTypeRow>("SELECT code, sort_order, name_zh, name_en, description_zh, description_en FROM lab_platform_types ORDER BY sort_order, code"),
        client.query<PlatformRow>(`SELECT p.code, t.code AS type_code, p.sort_order, p.name_zh, p.name_en, p.description_zh, p.description_en, p.status
          FROM lab_platforms p LEFT JOIN lab_platform_types t ON t.id = p.type_id ORDER BY p.sort_order, p.code`),
        client.query<AssetRow>(`SELECT a.code, a.device_type_zh, a.device_type_en, a.model, a.name_zh, a.name_en,
          a.description_zh, a.description_en, a.vendor_serial, a.status, p.code AS current_platform_code, a.share_scope, a.sort_order
          FROM lab_assets a LEFT JOIN lab_platforms p ON p.id = a.current_platform_id ORDER BY a.sort_order, a.code`),
        client.query<PlatformNoteRow>(`SELECT n.id::text AS id, p.code AS platform_code, n.sort_order, n.content_zh, n.content_en
          FROM lab_platform_notes n JOIN lab_platforms p ON p.id = n.platform_id ORDER BY p.code, n.sort_order, n.id`),
        client.query<AssetNoteRow>(`SELECT n.id::text AS id, a.code AS asset_code, n.sort_order, n.content_zh, n.content_en
          FROM lab_asset_notes n JOIN lab_assets a ON a.id = n.asset_id ORDER BY a.code, n.sort_order, n.id`),
      ]);
      const snapshot = buildSnapshot(pageResult.rows[0]?.content_json ?? {}, revisionResult.rows[0]?.revision ?? "0",
        types.rows, platforms.rows, assets.rows, platformNotes.rows, assetNotes.rows);
      await client.query("COMMIT");
      return snapshot;
    } catch (error) {
      primaryError = error;
      try { await client.query("ROLLBACK"); } catch (rollbackError) { attachCleanupFailure(primaryError, rollbackError); }
    } finally {
      try { client.release(); } catch (releaseError) {
        if (primaryError === undefined) throw releaseError;
        attachCleanupFailure(primaryError, releaseError);
      }
    }
    throw primaryError;
  }

  const duplicateCode = async (client: PoolClient, table: string, code: string, currentCode?: string) => {
    const result = await client.query(`SELECT code FROM ${table} WHERE code = $1${currentCode === undefined ? "" : " AND code <> $2"} LIMIT 1`,
      currentCode === undefined ? [code] : [code, currentCode]);
    return Boolean(result.rowCount);
  };

  const requireAffected = (result: { rowCount: number | null }, target: string) => {
    if (!result.rowCount) throw new ConflictError(`${target} not found`);
  };

  return {
    getSnapshot: dependencies.getSnapshot ?? getSnapshot,
    createAsset: (asset: LabAsset, expectedRevision: string, actorId: string) => mutate(
      { expectedRevision, actorId, action: "lab-assets.asset.create", targetType: "lab_assets", targetId: asset.code },
      async (client) => {
        if (await duplicateCode(client, "lab_assets", asset.code)) throw new ConflictError("Asset code already exists");
        const platformId = await findPlatformId(client, asset.currentPlatformCode);
        await client.query(`INSERT INTO lab_assets
          (code, device_type_zh, device_type_en, model, name_zh, name_en, description_zh, description_en, vendor_serial, status, current_platform_id, share_scope, sort_order)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [asset.code, asset.deviceType.zh, asset.deviceType.en, asset.model, asset.name.zh, asset.name.en, asset.description.zh,
          asset.description.en, asset.vendorSerial, asset.status, platformId, asset.shareScope, asset.sortOrder]);
      }),
    updateAsset: (code: string, asset: LabAsset, expectedRevision: string, actorId: string) => mutate(
      { expectedRevision, actorId, action: "lab-assets.asset.update", targetType: "lab_assets", targetId: code },
      async (client) => {
        if (await duplicateCode(client, "lab_assets", asset.code, code)) throw new ConflictError("Asset code already exists");
        const platformId = await findPlatformId(client, asset.currentPlatformCode);
        const result = await client.query(`UPDATE lab_assets SET code = $1, device_type_zh = $2, device_type_en = $3, model = $4, name_zh = $5,
          name_en = $6, description_zh = $7, description_en = $8, vendor_serial = $9, current_platform_id = $10,
          status = $11, share_scope = $12, sort_order = $13, updated_at = now() WHERE code = $14`,
        [asset.code, asset.deviceType.zh, asset.deviceType.en, asset.model, asset.name.zh, asset.name.en, asset.description.zh,
          asset.description.en, asset.vendorSerial, platformId, asset.status, asset.shareScope, asset.sortOrder, code]);
        requireAffected(result, "Asset");
      }),
    deleteAsset: (code: string, expectedRevision: string, actorId: string) => mutate(
      { expectedRevision, actorId, action: "lab-assets.asset.delete", targetType: "lab_assets", targetId: code },
      async (client) => { requireAffected(await client.query("DELETE FROM lab_assets WHERE code = $1", [code]), "Asset"); }),
    addAssetNote: (code: string, note: LabNote, expectedRevision: string, actorId: string) => mutate(
      { expectedRevision, actorId, action: "lab-assets.asset-note.create", targetType: "lab_asset_notes", targetId: code },
      async (client) => { requireAffected(await client.query(`INSERT INTO lab_asset_notes (asset_id, sort_order, content_zh, content_en)
        SELECT id, $1, $2, $3 FROM lab_assets WHERE code = $4`, [note.sortOrder, note.content.zh, note.content.en, code]), "Asset"); }),
    createPlatformType: (item: LabPlatformType, expectedRevision: string, actorId: string) => mutate(
      { expectedRevision, actorId, action: "lab-assets.platform-type.create", targetType: "lab_platform_types", targetId: item.code },
      async (client) => {
        if (await duplicateCode(client, "lab_platform_types", item.code)) throw new ConflictError("Platform type code already exists");
        await client.query(`INSERT INTO lab_platform_types (code, sort_order, name_zh, name_en, description_zh, description_en)
          VALUES ($1,$2,$3,$4,$5,$6)`, [item.code, item.sortOrder, item.name.zh, item.name.en, item.description.zh, item.description.en]);
      }),
    updatePlatformType: (code: string, item: LabPlatformType, expectedRevision: string, actorId: string) => mutate(
      { expectedRevision, actorId, action: "lab-assets.platform-type.update", targetType: "lab_platform_types", targetId: code },
      async (client) => {
        if (await duplicateCode(client, "lab_platform_types", item.code, code)) throw new ConflictError("Platform type code already exists");
        const result = await client.query(`UPDATE lab_platform_types SET code = $1, sort_order = $2, name_zh = $3, name_en = $4,
          description_zh = $5, description_en = $6, updated_at = now() WHERE code = $7`,
        [item.code, item.sortOrder, item.name.zh, item.name.en, item.description.zh, item.description.en, code]);
        requireAffected(result, "Platform type");
      }),
    deletePlatformType: (code: string, expectedRevision: string, actorId: string) => mutate(
      { expectedRevision, actorId, action: "lab-assets.platform-type.delete", targetType: "lab_platform_types", targetId: code },
      async (client) => {
        const typeId = await findPlatformTypeId(client, code);
        const referenced = await client.query("SELECT 1 AS exists FROM lab_platforms WHERE type_id = $1 LIMIT 1", [typeId]);
        if (referenced.rowCount) throw new ConflictError("Platform type is still referenced");
        requireAffected(await client.query("DELETE FROM lab_platform_types WHERE id = $1", [typeId]), "Platform type");
      }),
    createPlatform: (item: LabPlatform, expectedRevision: string, actorId: string) => mutate(
      { expectedRevision, actorId, action: "lab-assets.platform.create", targetType: "lab_platforms", targetId: item.code },
      async (client) => {
        if (await duplicateCode(client, "lab_platforms", item.code)) throw new ConflictError("Platform code already exists");
        const typeId = await findPlatformTypeId(client, item.typeCode);
        await client.query(`INSERT INTO lab_platforms (code, type_id, sort_order, name_zh, name_en, description_zh, description_en, status)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [item.code, typeId, item.sortOrder, item.name.zh, item.name.en, item.description.zh, item.description.en, item.status]);
      }),
    updatePlatform: (code: string, item: LabPlatform, expectedRevision: string, actorId: string) => mutate(
      { expectedRevision, actorId, action: "lab-assets.platform.update", targetType: "lab_platforms", targetId: code },
      async (client) => {
        if (await duplicateCode(client, "lab_platforms", item.code, code)) throw new ConflictError("Platform code already exists");
        const typeId = await findPlatformTypeId(client, item.typeCode);
        const result = await client.query(`UPDATE lab_platforms SET code = $1, type_id = $2, sort_order = $3, name_zh = $4, name_en = $5,
          description_zh = $6, description_en = $7, status = $8, updated_at = now() WHERE code = $9`,
        [item.code, typeId, item.sortOrder, item.name.zh, item.name.en, item.description.zh, item.description.en, item.status, code]);
        requireAffected(result, "Platform");
      }),
    deletePlatform: (code: string, expectedRevision: string, actorId: string) => mutate(
      { expectedRevision, actorId, action: "lab-assets.platform.delete", targetType: "lab_platforms", targetId: code },
      async (client) => {
        const platformId = await findPlatformId(client, code);
        const referenced = await client.query("SELECT 1 AS exists FROM lab_assets WHERE current_platform_id = $1 LIMIT 1", [platformId]);
        if (referenced.rowCount) throw new ConflictError("Platform is still referenced");
        requireAffected(await client.query("DELETE FROM lab_platforms WHERE id = $1", [platformId]), "Platform");
      }),
    addPlatformNote: (code: string, note: LabNote, expectedRevision: string, actorId: string) => mutate(
      { expectedRevision, actorId, action: "lab-assets.platform-note.create", targetType: "lab_platform_notes", targetId: code },
      async (client) => { requireAffected(await client.query(`INSERT INTO lab_platform_notes (platform_id, sort_order, content_zh, content_en)
        SELECT id, $1, $2, $3 FROM lab_platforms WHERE code = $4`, [note.sortOrder, note.content.zh, note.content.en, code]), "Platform"); }),
    deletePlatformNote: (code: string, noteId: string, expectedRevision: string, actorId: string) => mutate(
      { expectedRevision, actorId, action: "lab-assets.platform-note.delete", targetType: "lab_platform_notes", targetId: noteId },
      async (client) => { requireAffected(await client.query(`DELETE FROM lab_platform_notes n USING lab_platforms p
        WHERE n.id = $1::bigint AND n.platform_id = p.id AND p.code = $2`, [noteId, code]), "Platform note"); }),
    deleteAssetNote: (code: string, noteId: string, expectedRevision: string, actorId: string) => mutate(
      { expectedRevision, actorId, action: "lab-assets.asset-note.delete", targetType: "lab_asset_notes", targetId: noteId },
      async (client) => { requireAffected(await client.query(`DELETE FROM lab_asset_notes n USING lab_assets a
        WHERE n.id = $1::bigint AND n.asset_id = a.id AND a.code = $2`, [noteId, code]), "Asset note"); }),
    updatePage: (page: unknown, expectedRevision: string, actorId: string) => mutate(
      { expectedRevision, actorId, action: "lab-assets.page.update", targetType: "page_content", targetId: "lab_assets_page" },
      async (client) => { await client.query(`INSERT INTO page_content (page_key, content_json, updated_at) VALUES ($1, $2::jsonb, now())
        ON CONFLICT (page_key) DO UPDATE SET content_json = EXCLUDED.content_json, updated_at = now()`,
      ["lab_assets_page", JSON.stringify(page)]); }),
  };
}

export type LabAssetsService = ReturnType<typeof createLabAssetsService>;
