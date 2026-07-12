import assert from "node:assert/strict";
import test from "node:test";
import {
  collectionRequestSchemas,
  pageKeySchema,
  pageRequestSchema
} from "./schemas.js";

test("page keys are restricted to the public page allowlist", () => {
  assert.equal(pageKeySchema.safeParse("home").success, true);
  assert.equal(pageKeySchema.safeParse("admin").success, false);
});

test("page requests reject unknown top-level fields and prototype keys", () => {
  assert.equal(pageRequestSchema.safeParse({ content: {}, expectedUpdatedAt: "0", extra: true }).success, false);
  const content = JSON.parse('{"__proto__":{"polluted":true}}');
  assert.equal(pageRequestSchema.safeParse({ content, expectedUpdatedAt: "0" }).success, false);
});

test("page requests reject oversized strings and nested functions", () => {
  assert.equal(pageRequestSchema.safeParse({ content: { title: "x".repeat(20_001) }, expectedUpdatedAt: "0" }).success, false);
  assert.equal(pageRequestSchema.safeParse({ content: { callback() {} }, expectedUpdatedAt: "0" }).success, false);
});

test("research collections validate identifiers and preserve supported fields", () => {
  const parsed = collectionRequestSchemas.research.safeParse({
    expectedUpdatedAt: "3",
    items: [{ id: "paper-1", title: { zh: "论文", en: "Paper" }, year: 2026, authors: [{ name: { en: "Alice" }, highlight: true }] }]
  });
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.success && parsed.data.items[0].authors?.[0].highlight, true);
  assert.equal(collectionRequestSchemas.research.safeParse({ expectedUpdatedAt: "3", items: [{ title: { en: "Missing id" } }] }).success, false);
});

test("collections reject unknown top-level fields and oversized lists", () => {
  assert.equal(collectionRequestSchemas.news.safeParse({ expectedUpdatedAt: "0", items: [], extra: true }).success, false);
  assert.equal(collectionRequestSchemas.news.safeParse({ expectedUpdatedAt: "0", items: Array.from({ length: 501 }, (_, id) => ({ id: String(id), title: { en: "News" } })) }).success, false);
});

test("contact items require the three supported collection groups", () => {
  assert.equal(collectionRequestSchemas.contact.safeParse({ expectedUpdatedAt: "0", items: { primaryChannels: [], socialLinks: [], extraCards: [] } }).success, true);
  assert.equal(collectionRequestSchemas.contact.safeParse({ expectedUpdatedAt: "0", items: [] }).success, false);
});
