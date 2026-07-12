import assert from "node:assert/strict";
import test from "node:test";
import { getLocalizedText, normalizeInternalHref } from "./i18n.ts";

test("getLocalizedText uses the requested locale and falls back to the other locale", () => {
  assert.equal(getLocalizedText({ zh: "中文", en: "English" }, "en"), "English");
  assert.equal(getLocalizedText({ zh: "中文", en: "" }, "en"), "中文");
  assert.equal(getLocalizedText(" Plain text ", "zh"), "Plain text");
});

test("normalizeInternalHref maps legacy HTML routes to Next routes", () => {
  assert.equal(normalizeInternalHref("index.html"), "/");
  assert.equal(normalizeInternalHref("research.html"), "/research");
  assert.equal(normalizeInternalHref("team"), "/team");
});

test("normalizeInternalHref rejects executable and data URLs", () => {
  assert.equal(normalizeInternalHref("javascript:alert(1)"), "/");
  assert.equal(normalizeInternalHref("data:text/html,hello"), "/");
  assert.equal(normalizeInternalHref("vbscript:msgbox(1)"), "/");
  assert.equal(normalizeInternalHref("https://example.com"), "https://example.com");
  assert.equal(normalizeInternalHref("mailto:lab@example.com"), "mailto:lab@example.com");
});
