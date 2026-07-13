import assert from "node:assert/strict";
import test from "node:test";
import {
  applyRevision,
  canWriteLabAssets,
  filterAssets,
  labAssetsRedirects,
  normalizeLabAssetsSnapshot,
} from "./model.ts";

test("legacy lab assets route permanently redirects into the console", () => {
  assert.deepEqual(labAssetsRedirects, [{ source: "/lab-assets", destination: "/console/lab-assets", permanent: true }]);
});

const rawSnapshot = {
  revision: "7",
  page: { title: { zh: "实验室资产", en: "Lab assets" } },
  stats: { totalAssets: 2, totalPlatforms: 1 },
  platformTypes: [{
    code: "robot",
    name: { zh: "机器人", en: "Robots" },
    description: { zh: "", en: "" },
    sortOrder: 1,
    platforms: [{
      code: "DOG-2",
      typeCode: "robot",
      name: { zh: "机器狗", en: "Robot dog" },
      description: { zh: "四足", en: "Quadruped" },
      status: "active",
      sortOrder: 1,
      notes: [],
      assets: ["CAM-1"],
    }],
  }],
  platforms: [],
  assets: [
    { code: "CAM-1", deviceType: { zh: "相机", en: "Camera" }, model: "D455", name: { zh: "前置相机", en: "Front camera" }, description: { zh: "", en: "" }, vendorSerial: "SN-1", status: "mounted", currentPlatformCode: "DOG-2", shareScope: "shared", sortOrder: 1, notes: [] },
    { code: "LIDAR-1", deviceType: { zh: "雷达", en: "Lidar" }, model: "M1", name: { zh: "雷达", en: "Lidar" }, description: { zh: "", en: "" }, vendorSerial: "", status: "idle", currentPlatformCode: null, shareScope: "internal", sortOrder: 2, notes: [] },
  ],
};

test("normalizes a snapshot and derives flat platforms from grouped data when needed", () => {
  const snapshot = normalizeLabAssetsSnapshot(rawSnapshot);
  assert.equal(snapshot.revision, "7");
  assert.equal(snapshot.platforms.length, 1);
  assert.equal(snapshot.platforms[0].code, "DOG-2");
  assert.deepEqual(snapshot.platforms[0].assets, ["CAM-1"]);
});

test("filters assets by search, status, and platform without mutating the snapshot", () => {
  const snapshot = normalizeLabAssetsSnapshot(rawSnapshot);
  assert.deepEqual(filterAssets(snapshot.assets, { platform: "DOG-2", query: "d455", status: "mounted" }).map((item) => item.code), ["CAM-1"]);
  assert.deepEqual(filterAssets(snapshot.assets, { platform: "unassigned", query: "雷达", status: "all" }).map((item) => item.code), ["LIDAR-1"]);
  assert.equal(snapshot.assets.length, 2);
});

test("write controls depend only on lab_assets.write and revisions update atomically", () => {
  assert.equal(canWriteLabAssets(["lab_assets.read"]), false);
  assert.equal(canWriteLabAssets(["lab_assets.write"]), true);
  const snapshot = normalizeLabAssetsSnapshot(rawSnapshot);
  const updated = applyRevision(snapshot, "8");
  assert.equal(updated.revision, "8");
  assert.equal(snapshot.revision, "7");
});

test("rejects malformed snapshots instead of rendering partial privileged data", () => {
  assert.throws(() => normalizeLabAssetsSnapshot({ revision: 1, assets: [] }), /数据格式/);
});
