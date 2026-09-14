import assert from "node:assert/strict";
import test from "node:test";
import { createUpstreamHeaders, validateIncomingOrigin } from "./proxy.ts";

test("scholarly proxy forwards session context but never provider credentials", () => {
  const request = new Request("https://r-navigation.com/api/scholarly-sync/status", { headers: { cookie: "rnav_session=token", authorization: "Bearer must-not-forward", "x-api-key": "must-not-forward" } });
  const headers = createUpstreamHeaders(request);
  assert.equal(headers.get("cookie"), "rnav_session=token");
  assert.equal(headers.get("authorization"), null); assert.equal(headers.get("x-api-key"), null);
});
test("scholarly proxy requires same origin for mutations and permits originless reads", () => {
  assert.equal(validateIncomingOrigin(new Request("https://r-navigation.com/api/scholarly-sync/status")), null);
  assert.equal(validateIncomingOrigin(new Request("https://r-navigation.com/api/scholarly-sync/sync-all", { method: "POST" }))?.status, 403);
  assert.equal(validateIncomingOrigin(new Request("https://r-navigation.com/api/scholarly-sync/sync-all", { method: "POST", headers: { origin: "https://evil.example" } }))?.status, 403);
});
