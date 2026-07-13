import assert from "node:assert/strict";
import test from "node:test";
import { pageRequestSchema } from "./schemas.js";

test("lab assets page content requires a bounded plain JSON object", () => {
  assert.equal(pageRequestSchema.safeParse({ page: { header: { title: { zh: "资产", en: "Assets" } } }, expectedRevision: "0" }).success, true);
  for (const page of [null, [], "text", 1, true]) {
    assert.equal(pageRequestSchema.safeParse({ page, expectedRevision: "0" }).success, false);
  }
  assert.equal(pageRequestSchema.safeParse({ page: { title: "x".repeat(20_001) }, expectedRevision: "0" }).success, false);
  assert.equal(pageRequestSchema.safeParse({ page: { callback() {} }, expectedRevision: "0" }).success, false);
  assert.equal(pageRequestSchema.safeParse({ page: { __proto__: { polluted: true } }, expectedRevision: "0" }).success, false);
});
