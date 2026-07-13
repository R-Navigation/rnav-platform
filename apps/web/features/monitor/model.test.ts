import assert from "node:assert/strict";
import test from "node:test";
import { applyMonitorMessage, canManageMonitor, normalizeMonitorSnapshot } from "./model.ts";

const raw = {
  generatedAt: "2026-01-01T00:00:00.000Z",
  summary: { onlineDeviceCount: 1, totalDeviceCount: 2, alertCount: 1 },
  settings: { defaultCenterLng: 114.3, defaultCenterLat: 30.5, defaultZoom: 13, refreshHintSeconds: 5 },
  categories: [{ id: "cat-1", code: "robot", nameZh: "机器人", nameEn: "Robots", color: "#16a34a", icon: "bot" }],
  devices: [{ id: "device-1", code: "DOG-1", displayName: "机器狗", nameZh: "机器狗", nameEn: "Robot dog", isEnabled: true, isPublic: true, metadata: {}, currentState: { isOnline: true, systemState: { batteryPct: 88, signalPct: 76 }, taskState: { mode: "patrol", missionStatus: "running" }, geoState: { lng: 114.3, lat: 30.5 } } }],
  alerts: [], events: [], services: [],
};

test("monitor snapshot normalization keeps stable public and console identifiers", () => {
  const snapshot = normalizeMonitorSnapshot(raw);
  assert.equal(snapshot.devices[0].id, "device-1");
  assert.equal(snapshot.devices[0].code, "DOG-1");
  assert.equal(snapshot.devices[0].currentState.systemState.batteryPct, 88);
  const publicSnapshot = normalizeMonitorSnapshot({ ...raw, devices: [{ ...raw.devices[0], id: undefined, metadata: undefined }] });
  assert.equal(publicSnapshot.devices[0].id, undefined);
  assert.deepEqual(publicSnapshot.devices[0].metadata, {});
});

test("realtime state updates replace devices by internal id or public code", () => {
  const snapshot = normalizeMonitorSnapshot(raw);
  const updated = applyMonitorMessage(snapshot, { type: "device.current-state.updated", payload: { device: { ...raw.devices[0], currentState: { ...raw.devices[0].currentState, isOnline: false } } } });
  assert.equal(updated.devices[0].currentState.isOnline, false);
  assert.equal(updated.summary.onlineDeviceCount, 0);
  assert.notEqual(updated, snapshot);
});

test("monitor management capabilities follow granular permissions", () => {
  assert.deepEqual(canManageMonitor(["monitor.devices.read"]), { read: true, devices: false, settings: false });
  assert.deepEqual(canManageMonitor(["monitor.devices.write", "monitor.settings.write"]), { read: false, devices: true, settings: true });
});
