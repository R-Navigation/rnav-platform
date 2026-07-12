import assert from "node:assert/strict";
import test from "node:test";
import {
  ConflictError,
  createLabAssetsService,
  RevisionConflictError,
  type LabAsset,
} from "./labAssetsService.js";

type Call = { sql: string; values?: readonly unknown[] };

class FakeClient {
  calls: Call[] = [];
  released = false;
  duplicateAsset = false;
  revisionConflict = false;
  writeError?: Error;

  async query(sql: string, values?: readonly unknown[]) {
    this.calls.push({ sql, values });
    if (sql.includes("UPDATE site_content_revisions")) {
      if (this.revisionConflict) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [{ revision: "4" }] };
    }
    if (sql.includes("SELECT code FROM lab_assets") && this.duplicateAsset) {
      return { rowCount: 1, rows: [{ code: "CAM-1" }] };
    }
    if (sql.includes("SELECT id FROM lab_platforms")) {
      return { rowCount: 1, rows: [{ id: "22" }] };
    }
    if (this.writeError && sql.includes("INSERT INTO lab_asset_notes")) throw this.writeError;
    return { rowCount: 1, rows: [] };
  }

  release() {
    this.released = true;
  }
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

test("duplicate asset codes are rejected", async () => {
  const client = new FakeClient();
  client.duplicateAsset = true;
  const service = createLabAssetsService({ connect: async () => client } as never);

  await assert.rejects(
    service.createAsset(asset(), "3", "user-1"),
    (error: unknown) => error instanceof ConflictError && error.message === "Asset code already exists",
  );
  assert.equal(client.calls.some(({ sql }) => sql.includes("INSERT INTO lab_assets")), false);
  assert.equal(client.calls.at(-1)?.sql, "ROLLBACK");
  assert.equal(client.released, true);
});

test("platform reassignment updates current_platform_id", async () => {
  const client = new FakeClient();
  const service = createLabAssetsService({ connect: async () => client } as never);

  const revision = await service.updateAsset("CAM-1", asset(), "3", "user-1");

  const update = client.calls.find(({ sql }) => sql.includes("UPDATE lab_assets"));
  assert.match(update?.sql ?? "", /current_platform_id = \$10/);
  assert.equal(update?.values?.[9], "22");
  assert.equal(client.calls.some(({ sql }) => sql.includes("INSERT INTO audit_logs")), true);
  assert.equal(client.calls.at(-1)?.sql, "COMMIT");
  assert.equal(revision, "4");
});

test("related writes claim a revision and audit in one transaction", async () => {
  const client = new FakeClient();
  const service = createLabAssetsService({ connect: async () => client } as never);

  await service.addAssetNote("CAM-1", { content: { zh: "已校准", en: "Calibrated" }, sortOrder: 0 }, "3", "user-1");

  assert.equal(client.calls[0]?.sql, "BEGIN");
  assert.equal(client.calls.some(({ sql }) => sql.includes("UPDATE site_content_revisions")), true);
  assert.equal(client.calls.some(({ sql }) => sql.includes("INSERT INTO lab_asset_notes")), true);
  assert.equal(client.calls.some(({ sql }) => sql.includes("INSERT INTO audit_logs")), true);
  assert.equal(client.calls.at(-1)?.sql, "COMMIT");
});

test("revision conflicts roll back and release the client", async () => {
  const client = new FakeClient();
  client.revisionConflict = true;
  const service = createLabAssetsService({ connect: async () => client } as never);

  await assert.rejects(
    service.deleteAsset("CAM-1", "3", "user-1"),
    (error: unknown) => error instanceof RevisionConflictError,
  );
  assert.equal(client.calls.some(({ sql }) => sql.includes("DELETE FROM lab_assets")), false);
  assert.equal(client.calls.at(-1)?.sql, "ROLLBACK");
  assert.equal(client.released, true);
});

test("write failures roll back without auditing and release the client", async () => {
  const client = new FakeClient();
  client.writeError = new Error("write failed");
  const service = createLabAssetsService({ connect: async () => client } as never);

  await assert.rejects(
    service.addAssetNote("CAM-1", { content: { zh: "已校准", en: "Calibrated" }, sortOrder: 0 }, "3", "user-1"),
    /write failed/,
  );
  assert.equal(client.calls.some(({ sql }) => sql.includes("INSERT INTO audit_logs")), false);
  assert.equal(client.calls.at(-1)?.sql, "ROLLBACK");
  assert.equal(client.released, true);
});
