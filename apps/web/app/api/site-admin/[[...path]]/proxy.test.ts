import assert from "node:assert/strict";
import test from "node:test";
import { createUpstreamHeaders, validateIncomingOrigin } from "./proxy.ts";

test("proxy accepts a same-origin browser origin and constructs canonical upstream headers", () => {
  const request = new Request("https://console.example.com/api/site-admin/news-items", {
    headers: {
      cookie: "session=abc",
      "content-type": "application/json",
      host: "console.example.com",
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
});

test("proxy rejects cross-origin, malformed, and multiple browser origins", () => {
  for (const origin of ["https://evil.example", "not-an-origin", "https://console.example.com, https://evil.example"]) {
    const rejection = validateIncomingOrigin(new Request("https://console.example.com/api/site-admin/news-items", {
      method: "PUT",
      headers: { origin },
    }));

    assert.equal(rejection?.status, 403);
  }
});

test("proxy requires an origin for mutations but permits GET without one", () => {
  const mutation = validateIncomingOrigin(new Request("https://console.example.com/api/site-admin/news-items", { method: "PUT" }));
  const read = validateIncomingOrigin(new Request("https://console.example.com/api/site-admin/news-items"));

  assert.equal(mutation?.status, 403);
  assert.equal(read, null);
});
