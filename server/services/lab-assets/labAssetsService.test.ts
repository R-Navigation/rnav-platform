import assert from "node:assert/strict";
import test from "node:test";
import {
  ConflictError,
  createLabAssetsService,
  RevisionConflictError,
  type LabAsset,
  type LabPlatform,
  type LabPlatformType,
} from "./labAssetsService.js";

type Call = { sql: string; values?: readonly unknown[] };
type QueryResult = { rowCount: number; rows: Record<string, unknown>[] };
type CleanupError = Error & { cleanupFailures?: unknown[] };

class FakeClient {
  calls: Call[] = [];
  released = false;
  releaseError?: Error;
  rollbackError?: Error;

  constructor(private readonly respond: (call: Call) => QueryResult = defaultResponse) {}

  async query(sql: string, values?: readonly unknown[]) {
    const call = { sql, values };
    this.calls.push(call);
    if (sql === "ROLLBACK" && this.rollbackError) throw this.rollbackError;
    return this.respond(call);
  }

  release() {
    this.released = true;
    if (this.releaseError) throw this.releaseError;
  }
}

function defaultResponse({ sql }: Call): QueryResult {
  if (sql.includes("UPDATE site_content_revisions")) return { rowCount: 1, rows: [{ revision: "4" }] };
  if (sql.includes("SELECT code FROM lab_")) return { rowCount: 0, rows: [] };
  if (sql.includes("SELECT id FROM lab_platforms")) return { rowCount: 1, rows: [{ id: "22" }] };
  if (sql.includes("SELECT id FROM lab_platform_types")) return { rowCount: 1, rows: [{ id: "11" }] };
  return { rowCount: 1, rows: [] };
}

const asset = (overrides: Partial<LabAsset> = {}): LabAsset => ({
  code: "CAM-1",
  currentPlatformCode: "DOG-2",
  description: { en: "Front camera", zh: "前置相机" },
  deviceType: { en: "Camera", zh: "相机" },
  model: "D455",
  name: { en: "Camera 1", zh: "相机 1" },
  shareScope: "internal",
  sortOrder: 10,
  status: "mounted",
  vendorSerial: "SN-1",
  ...overrides,
});

const platformType = (overrides: Partial<LabPlatformType> = {}): LabPlatformType => ({
  code: "robot",
  description: { en: "Robot platforms", zh: "机器人平台" },
  name: { en: "Robots", zh: "机器人" },
  sortOrder: 1,
  ...overrides,
});

const platform = (overrides: Partial<LabPlatform> = {}): LabPlatform => ({
  code: "DOG-2",
  description: { en: "Quadruped platform", zh: "四足平台" },
  name: { en: "Dog 2", zh: "机器狗 2" },
  sortOrder: 2,
  status: "maintenance",
  typeCode: "robot",
  ...overrides,
});

function serviceWith(client: FakeClient) {
  return createLabAssetsService({ connect: async () => client } as never);
}

function findCall(client: FakeClient, fragment: string) {
  return client.calls.find(({ sql }) => sql.includes(fragment));
}

test("getSnapshot uses one repeatable-read connection and builds nested normalized data", async () => {
  const client = new FakeClient(({ sql }) => {
    if (sql.includes("FROM page_content")) return { rowCount: 1, rows: [{ content_json: { header: { title: { zh: "资产", en: "Assets" } } } }] };
    if (sql.includes("FROM site_content_revisions")) return { rowCount: 1, rows: [{ revision: "9" }] };
    if (sql.includes("FROM lab_platform_types")) return { rowCount: 1, rows: [{ code: "robot", sort_order: 1, name_zh: "机器人", name_en: "Robots", description_zh: "类型", description_en: "Type" }] };
    if (sql.includes("FROM lab_platforms")) return { rowCount: 2, rows: [
      { code: "DOG-2", type_code: "robot", sort_order: 2, name_zh: "机器狗 2", name_en: "Dog 2", description_zh: "", description_en: "", status: "maintenance" },
      { code: "UAV-1", type_code: null, sort_order: 3, name_zh: "无人机", name_en: "UAV", description_zh: "", description_en: "", status: "active" },
    ] };
    if (sql.includes("FROM lab_assets")) return { rowCount: 3, rows: [
      { code: "CAM-1", device_type_zh: "相机", device_type_en: "Camera", model: "D455", name_zh: "相机 1", name_en: "Camera 1", description_zh: "前置", description_en: "Front", vendor_serial: "SN-1", status: "mounted", current_platform_code: "DOG-2", share_scope: "shared", sort_order: 10 },
      { code: "LIDAR-1", device_type_zh: "雷达", device_type_en: "Lidar", model: "M1", name_zh: "雷达 1", name_en: "Lidar 1", description_zh: "", description_en: "", vendor_serial: "SN-2", status: "idle", current_platform_code: null, share_scope: "internal", sort_order: 11 },
      { code: "OLD-1", device_type_zh: "旧设备", device_type_en: "Legacy", model: "", name_zh: "旧设备", name_en: "Legacy", description_zh: "", description_en: "", vendor_serial: "", status: "retired", current_platform_code: null, share_scope: "private", sort_order: 12 },
    ] };
    if (sql.includes("FROM lab_platform_notes")) return { rowCount: 1, rows: [{ id: "5", platform_code: "DOG-2", sort_order: 0, content_zh: "维护", content_en: "Maintenance" }] };
    if (sql.includes("FROM lab_asset_notes")) return { rowCount: 1, rows: [{ id: "7", asset_code: "CAM-1", sort_order: 0, content_zh: "已校准", content_en: "Calibrated" }] };
    return { rowCount: 1, rows: [] };
  });

  const snapshot = await serviceWith(client).getSnapshot();

  assert.equal(client.calls[0]?.sql, "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  assert.equal(client.calls.at(-1)?.sql, "COMMIT");
  assert.equal(client.released, true);
  assert.equal(snapshot.revision, "9");
  assert.deepEqual(snapshot.page, { header: { title: { zh: "资产", en: "Assets" } } });
  assert.deepEqual(snapshot.stats, {
    activePlatforms: 1, emptyPlatforms: 0, idleAssets: 1, lendAssets: 0, lendPlatforms: 0,
    maintenanceAssets: 0, maintenancePlatforms: 1, mountedAssets: 1, partialPlatforms: 0,
    retiredAssets: 1, sharedAssets: 0, totalAssets: 3, totalPlatforms: 2,
  });
  assert.equal(snapshot.assets[0]?.shareScope, "shared");
  assert.equal(snapshot.assets[0]?.currentPlatformCode, "DOG-2");
  assert.equal(snapshot.assets[0]?.notes[0]?.content.en, "Calibrated");
  const firstPlatform = snapshot.platformTypes[0]?.platforms[0];
  assert.ok(firstPlatform);
  assert.equal(firstPlatform.assetCodes?.[0], "CAM-1");
  assert.equal(firstPlatform.notes?.[0]?.content.zh, "维护");
  assert.equal(snapshot.platformTypes[1]?.code, "uncategorized");
});

test("getSnapshot supports an injected queryable implementation", async () => {
  const expected = { assets: [], page: { custom: true }, platforms: [], platformTypes: [], revision: "12", stats: {} };
  let called = 0;
  const service = createLabAssetsService({ connect: async () => { throw new Error("unused"); } } as never, {
    getSnapshot: async () => { called += 1; return expected; },
  });

  assert.equal(await service.getSnapshot(), expected);
  assert.equal(called, 1);
});

test("snapshot read failures preserve the primary error through rollback and release failures", async () => {
  const primary = new Error("snapshot failed");
  const rollback = new Error("rollback failed");
  const release = new Error("release failed");
  const client = new FakeClient(({ sql }) => {
    if (sql.includes("FROM page_content")) throw primary;
    return { rowCount: 1, rows: [] };
  });
  client.rollbackError = rollback;
  client.releaseError = release;

  await assert.rejects(serviceWith(client).getSnapshot(), (error: unknown) => {
    assert.equal(error, primary);
    assert.deepEqual((error as CleanupError).cleanupFailures, [rollback, release]);
    return true;
  });
});

test("duplicate asset codes are rejected", async () => {
  const client = new FakeClient((call) => {
    if (call.sql.includes("SELECT code FROM lab_assets")) return { rowCount: 1, rows: [{ code: "CAM-1" }] };
    return defaultResponse(call);
  });

  await assert.rejects(serviceWith(client).createAsset(asset(), "3", "user-1"),
    (error: unknown) => error instanceof ConflictError && error.message === "Asset code already exists");
  assert.equal(Boolean(findCall(client, "INSERT INTO lab_assets")), false);
  assert.equal(client.calls.at(-1)?.sql, "ROLLBACK");
});

test("platform reassignment updates current_platform_id", async () => {
  const client = new FakeClient();
  const revision = await serviceWith(client).updateAsset("CAM-1", asset(), "3", "user-1");

  const update = findCall(client, "UPDATE lab_assets SET");
  assert.match(update?.sql ?? "", /current_platform_id = \$10/);
  assert.equal(update?.values?.[9], "22");
  assert.equal(Boolean(findCall(client, "INSERT INTO audit_logs")), true);
  assert.equal(client.calls.at(-1)?.sql, "COMMIT");
  assert.equal(revision, "4");
});

test("missing asset platform is a conflict", async () => {
  const client = new FakeClient((call) => call.sql.includes("SELECT id FROM lab_platforms")
    ? { rowCount: 0, rows: [] }
    : defaultResponse(call));

  await assert.rejects(serviceWith(client).updateAsset("CAM-1", asset(), "3", "user-1"),
    (error: unknown) => error instanceof ConflictError && error.message === "Platform not found");
  assert.equal(Boolean(findCall(client, "UPDATE lab_assets SET")), false);
});

test("platform type create and update use transaction, revision, audit, and parameterized writes", async () => {
  const createClient = new FakeClient();
  await serviceWith(createClient).createPlatformType(platformType(), "3", "user-1");
  const insert = findCall(createClient, "INSERT INTO lab_platform_types");
  assert.deepEqual(insert?.values, ["robot", 1, "机器人", "Robots", "机器人平台", "Robot platforms"]);
  assert.equal(createClient.calls[0]?.sql, "BEGIN");
  assert.equal(createClient.calls.at(-1)?.sql, "COMMIT");

  const updateClient = new FakeClient();
  await serviceWith(updateClient).updatePlatformType("robot", platformType({ code: "mobile" }), "3", "user-1");
  const update = findCall(updateClient, "UPDATE lab_platform_types SET");
  assert.equal(update?.values?.at(-1), "robot");
  assert.equal(update?.values?.[0], "mobile");
  assert.equal(Boolean(findCall(updateClient, "INSERT INTO audit_logs")), true);
});

test("duplicate platform type codes are conflicts on create and rename", async () => {
  for (const operation of ["create", "update"] as const) {
    const client = new FakeClient((call) => call.sql.includes("SELECT code FROM lab_platform_types")
      ? { rowCount: 1, rows: [{ code: "robot" }] }
      : defaultResponse(call));
    const service = serviceWith(client);
    const promise = operation === "create"
      ? service.createPlatformType(platformType(), "3", "user-1")
      : service.updatePlatformType("legacy", platformType(), "3", "user-1");
    await assert.rejects(promise, (error: unknown) => error instanceof ConflictError && error.message === "Platform type code already exists");
  }
});

test("platform create and update resolve the type and persist bilingual status fields", async () => {
  const createClient = new FakeClient();
  await serviceWith(createClient).createPlatform(platform(), "3", "user-1");
  const insert = findCall(createClient, "INSERT INTO lab_platforms");
  assert.deepEqual(insert?.values, ["DOG-2", "11", 2, "机器狗 2", "Dog 2", "四足平台", "Quadruped platform", "maintenance"]);

  const updateClient = new FakeClient();
  await serviceWith(updateClient).updatePlatform("DOG-1", platform({ code: "DOG-2" }), "3", "user-1");
  const update = findCall(updateClient, "UPDATE lab_platforms SET");
  assert.equal(update?.values?.[1], "11");
  assert.equal(update?.values?.at(-1), "DOG-1");
});

test("duplicate platform codes and missing platform types are conflicts", async () => {
  const duplicate = new FakeClient((call) => call.sql.includes("SELECT code FROM lab_platforms")
    ? { rowCount: 1, rows: [{ code: "DOG-2" }] }
    : defaultResponse(call));
  await assert.rejects(serviceWith(duplicate).createPlatform(platform(), "3", "user-1"),
    (error: unknown) => error instanceof ConflictError && error.message === "Platform code already exists");

  const missingType = new FakeClient((call) => call.sql.includes("SELECT id FROM lab_platform_types")
    ? { rowCount: 0, rows: [] }
    : defaultResponse(call));
  await assert.rejects(serviceWith(missingType).createPlatform(platform(), "3", "user-1"),
    (error: unknown) => error instanceof ConflictError && error.message === "Platform type not found");
});

test("referenced platform types and platforms are rejected before delete", async () => {
  const typeClient = new FakeClient((call) => {
    if (call.sql.includes("SELECT id FROM lab_platform_types")) return { rowCount: 1, rows: [{ id: "11" }] };
    if (call.sql.includes("FROM lab_platforms WHERE type_id")) return { rowCount: 1, rows: [{ exists: 1 }] };
    return defaultResponse(call);
  });
  await assert.rejects(serviceWith(typeClient).deletePlatformType("robot", "3", "user-1"),
    (error: unknown) => error instanceof ConflictError && error.message === "Platform type is still referenced");
  assert.equal(Boolean(findCall(typeClient, "DELETE FROM lab_platform_types")), false);

  const platformClient = new FakeClient((call) => {
    if (call.sql.includes("SELECT id FROM lab_platforms")) return { rowCount: 1, rows: [{ id: "22" }] };
    if (call.sql.includes("FROM lab_assets WHERE current_platform_id")) return { rowCount: 1, rows: [{ exists: 1 }] };
    return defaultResponse(call);
  });
  await assert.rejects(serviceWith(platformClient).deletePlatform("DOG-2", "3", "user-1"),
    (error: unknown) => error instanceof ConflictError && error.message === "Platform is still referenced");
  assert.equal(Boolean(findCall(platformClient, "DELETE FROM lab_platforms")), false);
});

test("unreferenced platform types and platforms delete by resolved id", async () => {
  const typeClient = new FakeClient((call) => call.sql.includes("FROM lab_platforms WHERE type_id")
    ? { rowCount: 0, rows: [] }
    : defaultResponse(call));
  await serviceWith(typeClient).deletePlatformType("robot", "3", "user-1");
  assert.deepEqual(findCall(typeClient, "DELETE FROM lab_platform_types")?.values, ["11"]);

  const platformClient = new FakeClient((call) => call.sql.includes("FROM lab_assets WHERE current_platform_id")
    ? { rowCount: 0, rows: [] }
    : defaultResponse(call));
  await serviceWith(platformClient).deletePlatform("DOG-2", "3", "user-1");
  assert.deepEqual(findCall(platformClient, "DELETE FROM lab_platforms")?.values, ["22"]);
});

test("platform and asset note mutations are scoped to their parent code", async () => {
  const platformClient = new FakeClient();
  await serviceWith(platformClient).addPlatformNote("DOG-2", { content: { zh: "维护", en: "Maintenance" }, sortOrder: 0 }, "3", "user-1");
  assert.deepEqual(findCall(platformClient, "INSERT INTO lab_platform_notes")?.values, [0, "维护", "Maintenance", "DOG-2"]);

  const deletePlatformClient = new FakeClient();
  await serviceWith(deletePlatformClient).deletePlatformNote("DOG-2", "5", "3", "user-1");
  assert.deepEqual(findCall(deletePlatformClient, "DELETE FROM lab_platform_notes")?.values, ["5", "DOG-2"]);

  const deleteAssetClient = new FakeClient();
  await serviceWith(deleteAssetClient).deleteAssetNote("CAM-1", "7", "3", "user-1");
  assert.deepEqual(findCall(deleteAssetClient, "DELETE FROM lab_asset_notes")?.values, ["7", "CAM-1"]);
});

test("page updates use a parameterized JSON upsert inside mutate", async () => {
  const client = new FakeClient();
  const page = { header: { title: { zh: "资产", en: "Assets" } } };
  await serviceWith(client).updatePage(page, "3", "user-1");

  const upsert = findCall(client, "INSERT INTO page_content");
  assert.match(upsert?.sql ?? "", /ON CONFLICT \(page_key\) DO UPDATE/);
  assert.deepEqual(upsert?.values, ["lab_assets_page", JSON.stringify(page)]);
});

test("revision conflicts roll back and release the client", async () => {
  const client = new FakeClient((call) => call.sql.includes("UPDATE site_content_revisions")
    ? { rowCount: 0, rows: [] }
    : defaultResponse(call));

  await assert.rejects(serviceWith(client).deleteAsset("CAM-1", "3", "user-1"),
    (error: unknown) => error instanceof RevisionConflictError);
  assert.equal(Boolean(findCall(client, "DELETE FROM lab_assets")), false);
  assert.equal(client.calls.at(-1)?.sql, "ROLLBACK");
  assert.equal(client.released, true);
});

test("mutation failures preserve the primary error through rollback and release failures", async () => {
  const primary = new Error("write failed");
  const rollback = new Error("rollback failed");
  const release = new Error("release failed");
  const client = new FakeClient((call) => {
    if (call.sql.includes("INSERT INTO lab_asset_notes")) throw primary;
    return defaultResponse(call);
  });
  client.rollbackError = rollback;
  client.releaseError = release;

  await assert.rejects(
    serviceWith(client).addAssetNote("CAM-1", { content: { zh: "已校准", en: "Calibrated" }, sortOrder: 0 }, "3", "user-1"),
    (error: unknown) => {
      assert.equal(error, primary);
      assert.deepEqual((error as CleanupError).cleanupFailures, [rollback, release]);
      return true;
    },
  );
  assert.equal(Boolean(findCall(client, "INSERT INTO audit_logs")), false);
});
