import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeActionUrl, sanitizePublicUrl } from "./url-sanitizer.js";

test("sanitizeActionUrl allows strict mailto and tel contact links", () => {
  assert.equal(sanitizeActionUrl("mailto:lab@example.com"), "mailto:lab@example.com");
  assert.equal(sanitizeActionUrl("tel:+86-27-6877-1234"), "tel:+86-27-6877-1234");
  assert.equal(sanitizeActionUrl("/contact"), "/contact");
});

test("sanitizeActionUrl rejects hostile contact scheme variants", () => {
  for (const value of [
    "mailto:lab@example.com%0d%0aBcc:evil@example.com",
    "mailto:lab\\@example.com",
    "mailto:<lab@example.com>",
    "tel:+86\\1234",
    "tel:123%0a456",
    "tel:javascript:alert(1)"
  ]) {
    assert.equal(sanitizeActionUrl(value), "", value);
  }
});

test("sanitizePublicUrl continues to reject mailto and tel for media and documents", () => {
  assert.equal(sanitizePublicUrl("mailto:lab@example.com"), "");
  assert.equal(sanitizePublicUrl("tel:+86-27-6877-1234"), "");
});
