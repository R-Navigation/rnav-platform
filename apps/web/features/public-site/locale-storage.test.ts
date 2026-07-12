import assert from "node:assert/strict";
import test from "node:test";
import { resolveHydratedLocale } from "./locale-storage.ts";

test("resolveHydratedLocale keeps an explicit server cookie locale", () => {
  assert.equal(resolveHydratedLocale("zh", true, "en"), "zh");
});

test("resolveHydratedLocale restores valid localStorage without a cookie", () => {
  assert.equal(resolveHydratedLocale("zh", false, "en"), "en");
  assert.equal(resolveHydratedLocale("zh", false, "invalid"), "zh");
  assert.equal(resolveHydratedLocale("zh", false, null), "zh");
});
