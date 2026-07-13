import assert from "node:assert/strict";
import test from "node:test";
import { createUpstreamHeaders, validateIncomingOrigin } from "./proxy.ts";

test("lab assets proxy forwards only canonical session and origin headers", () => {
  const request = new Request("https://console.example.com/api/lab-assets/assets/CAM-1", {
    method: "PUT",
    headers: {
      cookie: "session=abc",
      "content-type": "application/json",
      origin: "https://CONSOLE.example.com:443",
      "x-forwarded-host": "evil.example",
      "x-forwarded-proto": "http",
    },
  });

  assert.equal(validateIncomingOrigin(request), null);
  const headers = createUpstreamHeaders(request);
  assert.equal(headers.get("cookie"), "session=abc");
  assert.equal(headers.get("origin"), "https://console.example.com");
  assert.equal(headers.get("host"), "console.example.com");
  assert.equal(headers.get("x-forwarded-host"), "console.example.com");
  assert.equal(headers.get("x-forwarded-proto"), "https");
  assert.equal(headers.get("authorization"), null);
});

test("lab assets proxy rejects unsafe mutation origins and permits originless reads", () => {
  for (const origin of ["https://evil.example", "not-an-origin", "https://console.example.com, https://evil.example"]) {
    const rejection = validateIncomingOrigin(new Request("https://console.example.com/api/lab-assets/assets", {
      method: "POST",
      headers: { origin },
    }));
    assert.equal(rejection?.status, 403);
  }

  assert.equal(validateIncomingOrigin(new Request("https://console.example.com/api/lab-assets")), null);
  assert.equal(
    validateIncomingOrigin(new Request("https://console.example.com/api/lab-assets/assets", { method: "POST" }))?.status,
    403,
  );
});
