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

test("revision decimals are limited to the PostgreSQL bigint range", () => {
  assert.equal(pageRequestSchema.safeParse({ content: {}, expectedUpdatedAt: "9223372036854775807" }).success, true);
  assert.equal(pageRequestSchema.safeParse({ content: {}, expectedUpdatedAt: "9223372036854775808" }).success, false);
});

test("aggregate traversal budget rejects multiplicative collection payloads", () => {
  const items = Array.from({ length: 100 }, (_, itemIndex) => ({
    id: `paper-${itemIndex}`,
    keywords: Array.from({ length: 100 }, (_, keywordIndex) => ({ en: `keyword-${keywordIndex}` }))
  }));
  assert.equal(collectionRequestSchemas.research.safeParse({ expectedUpdatedAt: "0", items }).success, false);
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

test("facility ids are optional positive bigint decimals and never accepted then discarded", () => {
  assert.equal(collectionRequestSchemas.facility.safeParse({ expectedUpdatedAt: "0", items: [{ category: "quadrupeds" }] }).success, true);
  assert.equal(collectionRequestSchemas.facility.safeParse({ expectedUpdatedAt: "0", items: [{ id: "9223372036854775807", category: "quadrupeds" }] }).success, true);
  for (const id of ["facility-1", "0", "-1", "9223372036854775808"]) {
    assert.equal(collectionRequestSchemas.facility.safeParse({ expectedUpdatedAt: "0", items: [{ id, category: "quadrupeds" }] }).success, false, id);
  }
});

test("collection fields validate UUIDs, core types, and bounded localized values", () => {
  const validAssetId = "00000000-0000-4000-8000-000000000001";
  assert.equal(collectionRequestSchemas.research.safeParse({
    expectedUpdatedAt: "0",
    items: [{
      id: "paper-1", sortOrder: 1, title: { zh: "论文", en: "Paper" }, year: "",
      image: { assetId: validAssetId, src: "/paper.jpg", alt: "Paper", dataAlt: "Paper" },
      pdf: { assetId: null, src: "/paper.pdf", label: { en: "PDF" } },
      keywords: [{ en: "Navigation" }], authors: [{ name: { en: "Alice" }, highlight: true }],
      links: [{ label: { en: "Project" }, href: "/paper", icon: "link", variant: "primary" }]
    }]
  }).success, true);
  assert.equal(collectionRequestSchemas.research.safeParse({ expectedUpdatedAt: "0", items: [{ id: "paper-1", image: { assetId: "not-a-uuid", src: "/paper.jpg" } }] }).success, false);
  assert.equal(collectionRequestSchemas.news.safeParse({ expectedUpdatedAt: "0", items: [{ id: "news-1", featured: "yes" }] }).success, false);
  assert.equal(collectionRequestSchemas.facility.safeParse({ expectedUpdatedAt: "0", items: [{ id: "1", category: "quadrupeds", title: { en: "x".repeat(20_001) } }] }).success, false);
});

test("team collections use the public group allowlist and preserve legacy member fields", () => {
  for (const group of ["advisor", "postdoc", "phd", "master", "undergrad", "alumni"]) {
    const parsed = collectionRequestSchemas.team.safeParse({
      expectedUpdatedAt: "0",
      items: [{
        slug: `${group}-alice`, group, name: { en: "Alice" }, subtitle: { en: "Researcher" },
        bio: { en: "Bio" }, role: { en: "Role" }, focus: { en: "Focus" }, degree: { en: "Degree" },
        enrollmentYear: "2025", major: { en: "Robotics" }, research: { en: "Navigation" },
        graduation: { en: "2026" }, thesis: { en: "Thesis" }, destination: { en: "Lab" },
        image: null, links: [], contacts: [{ label: { en: "Email" }, value: "alice@example.com" }]
      }]
    });
    assert.equal(parsed.success, true, group);
  }
  assert.equal(collectionRequestSchemas.team.safeParse({ expectedUpdatedAt: "0", items: [{ slug: "visitor", group: "visitor" }] }).success, false);
});

test("collection identifiers and team slugs must be unique", () => {
  for (const key of ["research", "news", "facility"] as const) {
    const item = key === "facility" ? { id: "1", category: "quadrupeds" } : { id: "same" };
    const parsed = collectionRequestSchemas[key].safeParse({ expectedUpdatedAt: "0", items: [item, item] });
    assert.equal(parsed.success, false, key);
    if (!parsed.success) {
      assert.deepEqual(parsed.error.issues.at(-1)?.path, ["items", 1, "id"]);
      assert.match(parsed.error.issues.at(-1)?.message ?? "", /duplicate id/i);
    }
  }
  const team = collectionRequestSchemas.team.safeParse({ expectedUpdatedAt: "0", items: [
    { slug: "alice", group: "phd" }, { slug: "alice", group: "alumni" }
  ] });
  assert.equal(team.success, false);
  if (!team.success) {
    assert.deepEqual(team.error.issues.at(-1)?.path, ["items", 1, "slug"]);
    assert.match(team.error.issues.at(-1)?.message ?? "", /duplicate slug/i);
  }
});

test("unsupported child IDs are rejected consistently", () => {
  assert.equal(collectionRequestSchemas.research.safeParse({ expectedUpdatedAt: "0", items: [{ id: "paper-1", keywords: [{ id: "keyword-1", en: "Navigation" }] }] }).success, false);
  assert.equal(collectionRequestSchemas.team.safeParse({ expectedUpdatedAt: "0", items: [{ slug: "alice", group: "phd", links: [{ id: "link-1", href: "/alice" }] }] }).success, false);
  assert.equal(collectionRequestSchemas.facility.safeParse({ expectedUpdatedAt: "0", items: [{ id: "1", category: "quadrupeds", specs: [{ id: "spec-1", value: { en: "Fast" } }] }] }).success, false);
});

test("collections reject unknown top-level fields and oversized lists", () => {
  assert.equal(collectionRequestSchemas.news.safeParse({ expectedUpdatedAt: "0", items: [], extra: true }).success, false);
  assert.equal(collectionRequestSchemas.news.safeParse({ expectedUpdatedAt: "0", items: Array.from({ length: 501 }, (_, id) => ({ id: String(id), title: { en: "News" } })) }).success, false);
});

test("contact items require the three supported collection groups", () => {
  assert.equal(collectionRequestSchemas.contact.safeParse({ expectedUpdatedAt: "0", items: { primaryChannels: [], socialLinks: [], extraCards: [] } }).success, true);
  assert.equal(collectionRequestSchemas.contact.safeParse({ expectedUpdatedAt: "0", items: [] }).success, false);
});

test("contact groups require strict supported objects", () => {
  const valid = collectionRequestSchemas.contact.safeParse({ expectedUpdatedAt: "0", items: {
    primaryChannels: [{ icon: "mail", title: { en: "Email" }, value: { en: "hello@example.com" }, href: "mailto:hello@example.com" }],
    socialLinks: [{ icon: "github", label: { en: "GitHub" }, handle: { en: "rnav" }, href: "https://github.com/rnav" }],
    extraCards: [{ title: { en: "Visit" }, description: { en: "By appointment" }, value: { en: "Wuhan" } }]
  } });
  assert.equal(valid.success, true);
  for (const invalid of ["email", 1, [], null]) {
    assert.equal(collectionRequestSchemas.contact.safeParse({ expectedUpdatedAt: "0", items: { primaryChannels: [invalid], socialLinks: [], extraCards: [] } }).success, false);
  }
  assert.equal(collectionRequestSchemas.contact.safeParse({ expectedUpdatedAt: "0", items: { primaryChannels: [{ title: { en: "Email" }, unknown: true }], socialLinks: [], extraCards: [] } }).success, false);
});
