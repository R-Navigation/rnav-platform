import assert from "node:assert/strict";
import test from "node:test";
import { createUpstreamHeaders, validateIncomingOrigin, validateRequestSize } from "./proxy.ts";

test("procurement proxy forwards the session but never authorization", () => {
  const request = new Request("https://console.example.com/api/procurements", { method: "POST", headers: { cookie: "rnav_session=abc", origin: "https://console.example.com", authorization: "Bearer no" } });
  assert.equal(validateIncomingOrigin(request), null);
  const headers = createUpstreamHeaders(request);
  assert.equal(headers.get("cookie"), "rnav_session=abc");
  assert.equal(headers.get("authorization"), null);
});

test("procurement proxy rejects cross-origin and oversized mutations", () => {
  assert.equal(validateIncomingOrigin(new Request("https://console.example.com/api/procurements", { method: "POST" }))?.status, 403);
  assert.equal(validateIncomingOrigin(new Request("https://console.example.com/api/procurements", { method: "POST", headers: { origin: "https://evil.example" } }))?.status, 403);
  assert.equal(validateRequestSize(new Request("https://console.example.com/api/procurements", { method: "POST", headers: { "content-length": "1048577" } }))?.status, 413);
});
