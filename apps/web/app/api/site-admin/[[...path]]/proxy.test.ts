import assert from "node:assert/strict";
import test from "node:test";
import { createUpstreamHeaders } from "./proxy.ts";

test("proxy constructs a single canonical origin and forwarded host from its own URL", () => {
  const request = new Request("https://console.example.com/api/site-admin/news-items", {
    headers: {
      cookie: "session=abc",
      "content-type": "application/json",
      host: "console.example.com",
      origin: "https://evil.example",
      "x-forwarded-host": "evil.example",
      "x-forwarded-proto": "http",
    },
  });

  const headers = createUpstreamHeaders(request);
  assert.equal(headers.get("cookie"), "session=abc");
  assert.equal(headers.get("origin"), "https://console.example.com");
  assert.equal(headers.get("host"), "console.example.com");
  assert.equal(headers.get("x-forwarded-host"), "console.example.com");
  assert.equal(headers.get("x-forwarded-proto"), "https");
});
