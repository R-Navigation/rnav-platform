import assert from "node:assert/strict";
import test from "node:test";
import { createUpstreamHeaders, isAllowedMonitorPath, validateIncomingOrigin, validateRequestSize } from "./proxy.ts";

test("monitor proxy forwards only canonical session and origin headers", () => {
  const request = new Request("https://console.example.com/api/monitor/console/devices", {
    method: "POST",
    headers: { cookie: "locale=zh; rnav_session=abc; future=private", "content-type": "application/json", origin: "https://CONSOLE.example.com:443", authorization: "Bearer should-not-forward" },
  });
  assert.equal(validateIncomingOrigin(request), null);
  const headers = createUpstreamHeaders(request);
  assert.equal(headers.get("cookie"), "rnav_session=abc");
  assert.equal(headers.get("origin"), "https://console.example.com");
  assert.equal(headers.get("authorization"), null);
});

test("monitor proxy exposes only browser public and console APIs", () => {
  assert.equal(isAllowedMonitorPath(["public", "bootstrap"]), true);
  assert.equal(isAllowedMonitorPath(["console", "devices"]), true);
  assert.equal(isAllowedMonitorPath(["ingest", "v1", "telemetry"]), false);
  assert.equal(isAllowedMonitorPath(["private", "future"]), false);
});

test("monitor proxy rejects oversized mutation bodies", () => {
  const request = new Request("https://console.example.com/api/monitor/console/devices", { method: "POST", headers: { "content-length": "1048577" } });
  assert.equal(validateRequestSize(request)?.status, 413);
});

test("monitor proxy allows originless reads and rejects cross-origin mutations", () => {
  assert.equal(validateIncomingOrigin(new Request("https://console.example.com/api/monitor/public/bootstrap")), null);
  assert.equal(validateIncomingOrigin(new Request("https://console.example.com/api/monitor/console/settings", { method: "PUT", headers: { origin: "https://evil.example" } }))?.status, 403);
});
