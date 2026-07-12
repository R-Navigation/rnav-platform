import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeMonitorPreview } from "./monitor-preview.ts";

test("sanitizeMonitorPreview supports the legacy public monitor snapshot shape", () => {
  const result = sanitizeMonitorPreview({
    generatedAt: "2026-07-12T08:00:00.000Z",
    summary: {
      statusText: "1 devices online",
      onlineDeviceCount: 1,
      totalDeviceCount: 2,
      alertCount: 3,
      services: [{ serviceKey: "backend", metadata: { internal: true } }]
    },
    map: { defaultCenterLng: 114.3, defaultCenterLat: 30.5 },
    devices: [
      {
        code: "robot-1",
        displayName: "Robot One",
        authTokenHash: "hash-secret",
        metadata: { owner: "private" },
        currentState: {
          isOnline: true,
          heartbeatIntegrity: { level: "complete", color: "green", label: "完整" },
          geoState: { coordSystem: "WGS84", lng: 114.123456, lat: 30.654321 },
          payload: { token: "nested-secret" }
        }
      },
      {
        code: "robot-2",
        displayName: "Robot Two",
        token: "plain-secret",
        currentState: {
          isOnline: false,
          heartbeatIntegrity: { level: "missing-system", color: "red", label: "缺系统状态" },
          geoState: { lng: 115.123456, lat: 31.654321 }
        }
      }
    ]
  });

  assert.deepEqual(result, {
    summary: { statusText: "1 devices online", onlineCount: 1, totalCount: 2 },
    devices: [
      { code: "robot-1", displayName: "Robot One", isOnline: true, statusLabel: "完整" },
      { code: "robot-2", displayName: "Robot Two", isOnline: false, statusLabel: "缺系统状态" }
    ]
  });
  assert.equal(JSON.stringify(result).includes("114.123456"), false);
  assert.equal(JSON.stringify(result).includes("hash-secret"), false);
  assert.equal(JSON.stringify(result).includes("plain-secret"), false);
  assert.equal(JSON.stringify(result).includes("nested-secret"), false);
  assert.equal(JSON.stringify(result).includes("private"), false);
});

test("sanitizeMonitorPreview exposes only public summary and display fields", () => {
  const result = sanitizeMonitorPreview({
    summary: { statusText: "2 online", onlineCount: 2, totalCount: 3, secret: "no" },
    devices: [{ code: "robot-1", displayName: "Robot One", isOnline: true, statusLabel: "Online", token: "secret", currentState: { privateIp: "10.0.0.1" } }],
    credentials: { password: "secret" }
  });
  assert.deepEqual(result, {
    summary: { statusText: "2 online", onlineCount: 2, totalCount: 3 },
    devices: [{ code: "robot-1", displayName: "Robot One", isOnline: true, statusLabel: "Online" }]
  });
});

test("sanitizeMonitorPreview returns a stable unavailable fallback", () => {
  assert.deepEqual(sanitizeMonitorPreview(null), { summary: { statusText: "", onlineCount: 0, totalCount: 0 }, devices: [] });
});
