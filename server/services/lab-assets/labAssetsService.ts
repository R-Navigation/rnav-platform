import type { Pool, PoolClient } from "pg";
import type { LabAsset, LabNote, LabPlatform, LabPlatformType } from "./schemas.js";

type TransactionPool = Pick<Pool, "connect">;
type LabAssetsSnapshot = {
  assets: unknown[];
  page: Record<string, unknown>;
  platforms: unknown[];
  platformTypes: unknown[];
  revision: string;
  stats: Record<string, unknown>;
};
type Dependencies = { getSnapshot?: () => Promise<LabAssetsSnapshot> };
type AuditInput = { actorId: string; action: string; targetType: string; targetId: string; revision: string };

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

const emptySnapshot = (): LabAssetsSnapshot => ({
  assets: [],
  page: {},
  platforms: [],
  platformTypes: [],
  revision: "0",
  stats: {},
});

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

const notImplemented = async (): Promise<string> => {
  throw new Error("Lab assets operation is not implemented in 7A1");
};

export function createLabAssetsService(pool: TransactionPool, dependencies: Dependencies = {}) {
  async function mutate(
    input: Omit<AuditInput, "revision"> & { expectedRevision: string },
    write: (client: PoolClient) => Promise<void>,
  ) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const revision = await claimRevision(client, input.expectedRevision);
      await write(client);
      await writeAudit(client, { ...input, revision });
      await client.query("COMMIT");
      return revision;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original mutation error.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async function findPlatformId(client: PoolClient, code: string | null) {
    if (code === null) return null;
    const result = await client.query<{ id: string }>(
      "SELECT id FROM lab_platforms WHERE code = $1 LIMIT 1",
      [code],
    );
    if (!result.rowCount) throw new ConflictError("Platform not found");
    return result.rows[0].id;
  }

  return {
    getSnapshot: dependencies.getSnapshot ?? (async () => emptySnapshot()),
    createAsset: (asset: LabAsset, expectedRevision: string, actorId: string) => mutate(
      { expectedRevision, actorId, action: "lab-assets.asset.create", targetType: "lab_assets", targetId: asset.code },
      async (client) => {
        const duplicate = await client.query("SELECT code FROM lab_assets WHERE code = $1 LIMIT 1", [asset.code]);
        if (duplicate.rowCount) throw new ConflictError("Asset code already exists");
        const platformId = await findPlatformId(client, asset.currentPlatformCode);
        await client.query(
          `INSERT INTO lab_assets
             (code, device_type_zh, device_type_en, model, name_zh, name_en, description_zh,
              description_en, vendor_serial, status, current_platform_id, share_scope, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [asset.code, asset.deviceType.zh, asset.deviceType.en, asset.model, asset.name.zh, asset.name.en,
            asset.description.zh, asset.description.en, asset.vendorSerial, asset.status, platformId,
            asset.shareScope, asset.sortOrder],
        );
      },
    ),
    updateAsset: (code: string, asset: LabAsset, expectedRevision: string, actorId: string) => mutate(
      { expectedRevision, actorId, action: "lab-assets.asset.update", targetType: "lab_assets", targetId: code },
      async (client) => {
        const platformId = await findPlatformId(client, asset.currentPlatformCode);
        await client.query(
          `UPDATE lab_assets SET
             code = $1, device_type_zh = $2, device_type_en = $3, model = $4, name_zh = $5,
             name_en = $6, description_zh = $7, description_en = $8, vendor_serial = $9,
             current_platform_id = $10, status = $11, share_scope = $12, sort_order = $13,
             updated_at = now()
           WHERE code = $14`,
          [asset.code, asset.deviceType.zh, asset.deviceType.en, asset.model, asset.name.zh, asset.name.en,
            asset.description.zh, asset.description.en, asset.vendorSerial, platformId, asset.status,
            asset.shareScope, asset.sortOrder, code],
        );
      },
    ),
    deleteAsset: (code: string, expectedRevision: string, actorId: string) => mutate(
      { expectedRevision, actorId, action: "lab-assets.asset.delete", targetType: "lab_assets", targetId: code },
      async (client) => { await client.query("DELETE FROM lab_assets WHERE code = $1", [code]); },
    ),
    addAssetNote: (code: string, note: LabNote, expectedRevision: string, actorId: string) => mutate(
      { expectedRevision, actorId, action: "lab-assets.asset-note.create", targetType: "lab_asset_notes", targetId: code },
      async (client) => {
        await client.query(
          `INSERT INTO lab_asset_notes (asset_id, sort_order, content_zh, content_en)
           SELECT id, $1, $2, $3 FROM lab_assets WHERE code = $4`,
          [note.sortOrder, note.content.zh, note.content.en, code],
        );
      },
    ),
    createPlatformType: notImplemented as (item: LabPlatformType, expectedRevision: string, actorId: string) => Promise<string>,
    updatePlatformType: notImplemented as (code: string, item: LabPlatformType, expectedRevision: string, actorId: string) => Promise<string>,
    deletePlatformType: notImplemented as (code: string, expectedRevision: string, actorId: string) => Promise<string>,
    createPlatform: notImplemented as (item: LabPlatform, expectedRevision: string, actorId: string) => Promise<string>,
    updatePlatform: notImplemented as (code: string, item: LabPlatform, expectedRevision: string, actorId: string) => Promise<string>,
    deletePlatform: notImplemented as (code: string, expectedRevision: string, actorId: string) => Promise<string>,
    addPlatformNote: notImplemented as (code: string, note: LabNote, expectedRevision: string, actorId: string) => Promise<string>,
    deletePlatformNote: notImplemented as (code: string, noteId: string, expectedRevision: string, actorId: string) => Promise<string>,
    deleteAssetNote: notImplemented as (code: string, noteId: string, expectedRevision: string, actorId: string) => Promise<string>,
    updatePage: notImplemented as (page: unknown, expectedRevision: string, actorId: string) => Promise<string>,
  };
}

export type LabAssetsService = ReturnType<typeof createLabAssetsService>;
