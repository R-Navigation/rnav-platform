import assert from "node:assert/strict";
import test from "node:test";
import { assetBatchRequestSchema, assetImportRequestSchema, assetRequestSchema, pageRequestSchema, platformRequestSchema } from "./schemas.js";

test("lab assets page content requires a bounded plain JSON object", () => {
  assert.equal(pageRequestSchema.safeParse({ page: { header: { title: { zh: "资产", en: "Assets" } } }, expectedRevision: "0" }).success, true);
  for (const page of [null, [], "text", 1, true]) {
    assert.equal(pageRequestSchema.safeParse({ page, expectedRevision: "0" }).success, false);
  }
  assert.equal(pageRequestSchema.safeParse({ page: { title: "x".repeat(20_001) }, expectedRevision: "0" }).success, false);
  assert.equal(pageRequestSchema.safeParse({ page: { callback() {} }, expectedRevision: "0" }).success, false);
  assert.equal(pageRequestSchema.safeParse({ page: { __proto__: { polluted: true } }, expectedRevision: "0" }).success, false);
});

test("asset state fields follow the selected relationship", () => {
  const base = { code: "CAM-1", deviceTypeCode: "camera", model: "D455", name: { zh: "相机", en: "Camera" }, description: { zh: "", en: "" }, vendorSerial: "", currentPlatformCode: null, assignedUserId: null, borrowerName: "", borrowerContact: "", storageLocation: null, expectedRevision: "0" };
  assert.equal(assetRequestSchema.safeParse({ ...base, status: "idle" }).success, true);
  assert.equal(assetRequestSchema.parse({ ...base, storageLocation: undefined, status: "idle" }).storageLocation, null);
  assert.equal(assetRequestSchema.safeParse({ ...base, status: "mounted" }).success, false);
  assert.equal(assetRequestSchema.safeParse({ ...base, status: "mounted", currentPlatformCode: "DOG-1" }).success, true);
  assert.equal(assetRequestSchema.safeParse({ ...base, status: "in_use", assignedUserId: "00000000-0000-4000-8000-000000000001" }).success, true);
  assert.equal(assetRequestSchema.safeParse({ ...base, status: "lend", borrowerName: "李四", borrowerContact: "13800000000" }).success, true);
});

test("batch actions require unique assets and relationship-safe values", () => {
  const base = { assetCodes: ["CAM-1", "CAM-2"], expectedRevision: "4" };
  assert.equal(assetBatchRequestSchema.safeParse({ ...base, action: "set_location", value: "507-A 柜 3 层" }).success, true);
  assert.equal(assetBatchRequestSchema.safeParse({ ...base, action: "set_platform", value: null }).success, true);
  assert.equal(assetBatchRequestSchema.safeParse({ ...base, action: "set_status", value: "maintenance" }).success, true);
  assert.equal(assetBatchRequestSchema.safeParse({ ...base, action: "set_status", value: "in_use" }).success, false);
  assert.equal(assetBatchRequestSchema.safeParse({ ...base, assetCodes: ["CAM-1", "CAM-1"], action: "set_location", value: null }).success, false);
});

test("asset import rows preserve bounded source values for row-level validation", () => {
  const row = { code: "CAM-2", nameZh: "相机", nameEn: "Camera", model: "D455", deviceTypeCode: "camera", vendorSerial: "SN-2", storageLocation: "507", status: "idle", platformCode: "", descriptionZh: "" };
  assert.equal(assetImportRequestSchema.safeParse({ rows: [row], expectedRevision: "4" }).success, true);
  assert.equal(assetImportRequestSchema.safeParse({ rows: [row], expectedRevision: "4", createMissingDeviceTypes: true }).success, true);
  assert.equal(assetImportRequestSchema.safeParse({ rows: [{ ...row, procurementRequestId: "00000000-0000-4000-8000-000000000099" }], expectedRevision: "4" }).success, true);
  assert.equal(assetImportRequestSchema.safeParse({ rows: [{ ...row, procurementRequestId: "not-a-uuid" }], expectedRevision: "4" }).success, false);
  assert.equal(assetImportRequestSchema.safeParse({ rows: [{ ...row, status: "in_use" }], expectedRevision: "4" }).success, true);
  assert.equal(assetImportRequestSchema.safeParse({ rows: [{ ...row, status: "x".repeat(51) }], expectedRevision: "4" }).success, false);
  assert.equal(assetImportRequestSchema.safeParse({ rows: [{ ...row, status: "mounted" }], expectedRevision: "4" }).success, true);
  assert.equal(assetImportRequestSchema.safeParse({ rows: [{ ...row, status: "mounted", platformCode: "DOG-1" }], expectedRevision: "4" }).success, true);
});

test("platform composition rejects duplicate device selections", () => {
  const body = { code: "DOG-1", typeCode: "robot", name: { zh: "机器狗", en: "Robot dog" }, description: { zh: "", en: "" }, status: "active", assetCodes: ["CAM-1", "CAM-1"], expectedRevision: "0" };
  assert.equal(platformRequestSchema.safeParse(body).success, false);
});
