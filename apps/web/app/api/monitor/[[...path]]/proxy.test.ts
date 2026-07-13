import assert from "node:assert/strict";
import test from "node:test";
import { createUpstreamHeaders, validateIncomingOrigin } from "./proxy.ts";

test("monitor proxy forwards only canonical session and origin headers", () => {
  const request = new Request("https://console.example.com/api/monitor/console/devices", {
    method: "POST",
    headers: { cookie: "session=abc", "content-type": "application/json", origin: "https://CONSOLE.example.com:443", authorization: "Bearer should-not-forward" },
  });
  assert.equal(validateIncomingOrigin(request), null);
  const headers = createUpstreamHeaders(request);
  assert.equal(headers.get("cookie"), "session=abc");
  assert.equal(headers.get("origin"), "https://console.example.com");
  assert.equal(headers.get("authorization"), null);
});

test("monitor proxy allows originless reads and rejects cross-origin mutations", () => {
  assert.equal(validateIncomingOrigin(new Request("https://console.example.com/api/monitor/public/bootstrap")), null);
  assert.equal(validateIncomingOrigin(new Request("https://console.example.com/api/monitor/console/settings", { method: "PUT", headers: { origin: "https://evil.example" } }))?.status, 403);
});
