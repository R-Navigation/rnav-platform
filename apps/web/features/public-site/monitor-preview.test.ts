import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeMonitorPreview } from "./monitor-preview.ts";

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
