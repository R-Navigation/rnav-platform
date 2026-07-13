import assert from "node:assert/strict";
import test from "node:test";
import { deviceRequestSchema, ingestHeartbeatSchema, ingestTelemetrySchema, settingsRequestSchema } from "./schemas.js";

test("monitor device schemas bound identifiers, secrets, metadata, and coordinates", () => {
  const device = { code: "DOG-1", categoryCode: null, name: { zh: "机器狗", en: "Robot dog" }, model: "X", serialNumber: "SN", protocolType: "http", isEnabled: true, isPublic: true, sortOrder: 0, description: { zh: "", en: "" }, metadata: {}, token: "a".repeat(32) };
  assert.equal(deviceRequestSchema.safeParse(device).success, true);
  assert.equal(deviceRequestSchema.safeParse({ ...device, code: "" }).success, false);
  assert.equal(deviceRequestSchema.safeParse({ ...device, token: "short" }).success, false);
  assert.equal(deviceRequestSchema.safeParse({ ...device, metadata: { value: "x".repeat(20_001) } }).success, false);
  assert.equal(ingestTelemetrySchema.safeParse({ deviceCode: "DOG-1", reportedAt: new Date().toISOString(), geoState: { lng: 181, lat: 30 } }).success, false);
  assert.equal(ingestTelemetrySchema.safeParse({ deviceCode: "DOG-1", reportedAt: new Date().toISOString(), systemState: { batteryPct: 82, jetson: { cpuTempC: 41.2 } } }).success, true);
});

test("monitor settings reject unsafe map ranges and unknown fields", () => {
  assert.equal(settingsRequestSchema.safeParse({ defaultCenterLng: 114.3, defaultCenterLat: 30.5, defaultZoom: 13, mapProvider: "maplibre", theme: "nightwatch", refreshHintSeconds: 5 }).success, true);
  assert.equal(settingsRequestSchema.safeParse({ defaultCenterLng: 200, defaultCenterLat: 30.5, defaultZoom: 13, mapProvider: "maplibre", theme: "nightwatch", refreshHintSeconds: 5 }).success, false);
  assert.equal(settingsRequestSchema.safeParse({ defaultCenterLng: 114.3, defaultCenterLat: 30.5, defaultZoom: 13, mapProvider: "maplibre", theme: "nightwatch", refreshHintSeconds: 5, extra: true }).success, false);
});

test("monitor ingest normalizes documented legacy flat state without accepting arbitrary fields", () => {
  const legacy = ingestHeartbeatSchema.parse({
    deviceCode: "DOG-1", mode: "patrol", missionStatus: "nominal", batteryPct: 82.5,
    signalPct: 91, speedMps: 1.7, headingDeg: 118, altitudeM: 0,
    coordSystem: "wgs84", lng: 114.3, lat: 30.5,
    rawCoordSystem: "wgs84", rawLng: 114.31, rawLat: 30.51,
    displayCoordSystem: "gcj02", displayLng: 114.32, displayLat: 30.52,
    payload: { jetson: { cpuTempC: 41.2 } },
  });
  assert.deepEqual(legacy.taskState, { mode: "patrol", missionStatus: "nominal" });
  assert.deepEqual(legacy.systemState, { batteryPct: 82.5, signalPct: 91 });
  assert.deepEqual(legacy.geoState, { coordSystem: "gcj02", lng: 114.32, lat: 30.52, rawCoordSystem: "wgs84", rawLng: 114.31, rawLat: 30.51, speedMps: 1.7, headingDeg: 118, altitudeM: 0 });
  assert.equal(ingestHeartbeatSchema.safeParse({ deviceCode: "DOG-1", undocumented: true }).success, false);
});
