import assert from "node:assert/strict";
import test from "node:test";
import { assetRequestSchema, pageRequestSchema, platformRequestSchema } from "./schemas.js";

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
  const base = { code: "CAM-1", deviceTypeCode: "camera", model: "D455", name: { zh: "相机", en: "Camera" }, description: { zh: "", en: "" }, vendorSerial: "", currentPlatformCode: null, assignedUserId: null, borrowerName: "", borrowerContact: "", expectedRevision: "0" };
  assert.equal(assetRequestSchema.safeParse({ ...base, status: "idle" }).success, true);
  assert.equal(assetRequestSchema.safeParse({ ...base, status: "mounted" }).success, false);
  assert.equal(assetRequestSchema.safeParse({ ...base, status: "mounted", currentPlatformCode: "DOG-1" }).success, true);
  assert.equal(assetRequestSchema.safeParse({ ...base, status: "in_use", assignedUserId: "00000000-0000-4000-8000-000000000001" }).success, true);
  assert.equal(assetRequestSchema.safeParse({ ...base, status: "lend", borrowerName: "李四", borrowerContact: "13800000000" }).success, true);
});

test("platform composition rejects duplicate device selections", () => {
  const body = { code: "DOG-1", typeCode: "robot", name: { zh: "机器狗", en: "Robot dog" }, description: { zh: "", en: "" }, status: "active", assetCodes: ["CAM-1", "CAM-1"], expectedRevision: "0" };
  assert.equal(platformRequestSchema.safeParse(body).success, false);
});
