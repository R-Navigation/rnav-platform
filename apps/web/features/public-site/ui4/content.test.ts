import assert from "node:assert/strict";
import test from "node:test";
import {
  flattenFacilities,
  homeSlots,
  isDemoContent,
  publishedItems,
  selectConfigured,
} from "./content.ts";
import { publicNavigation } from "./navigation.ts";

test("4.1 composition pairs old CMS sections without duplication", () => {
  assert.deepEqual(
    homeSlots(["news", "facilities", "members", "featuredResearch", "unknown"]),
    ["people", "work", "directions", "status", "contact"],
  );
  assert.deepEqual(homeSlots(), [
    "directions",
    "work",
    "people",
    "status",
    "contact",
  ]);
  assert.deepEqual(homeSlots(["people", "directions", "contact", "work"]), [
    "people",
    "directions",
    "contact",
    "work",
    "status",
  ]);
});
test("featured selections preserve ID order and never invent missing records", () => {
  const items = [
    { id: 1, title: "A" },
    { id: 2, title: "B" },
    { id: 3, title: "C" },
  ];
  assert.deepEqual(selectConfigured(items, [3, "1", 3, 99]), [
    items[2],
    items[0],
  ]);
  assert.deepEqual(selectConfigured(items, []), items);
  assert.deepEqual(selectConfigured(items, [99]), []);
});
test("explicit demonstration content is excluded without mutation", () => {
  const real = { title: { zh: "真实成果", en: "Published research" } };
  const demo = {
    title: { zh: "【示意论文】导航", en: "【Example】Navigation" },
  };
  const items = [real, demo];
  assert.deepEqual(publishedItems(items), [real]);
  assert.equal(items.length, 2);
  assert.equal(
    isDemoContent({ description: { zh: "这里可以填写合作说明", en: "" } }),
    true,
  );
  assert.equal(
    isDemoContent({
      title: { en: "Learning from a Single Example", zh: "导航系统示意图分析" },
    }),
    false,
  );
});
test("public platform and equipment sections retain their kind and stable IDs", () => {
  const flattened = flattenFacilities({
    facilitySections: [
      {
        kind: "platform",
        subtitle: { zh: "类型一", en: "Type one" },
        items: [{ id: 4, title: { zh: "平台", en: "Platform" } }],
      },
      {
        kind: "asset",
        items: [{ id: 8, title: { zh: "设备", en: "Equipment" } }],
      },
      {
        title: { zh: "历史公开平台", en: "Legacy public platform" },
        items: [],
      },
    ],
  });
  assert.equal(flattened.length, 3);
  assert.equal(flattened[0].sectionKind, "platform");
  assert.equal(flattened[1].sectionKind, "asset");
  assert.deepEqual(
    flattened.map((item) => item.displayKey),
    ["4", "8", "section-2-0"],
  );
});
test("seven primary routes distinguish directions from publications", () => {
  assert.deepEqual(
    publicNavigation.map((item) => item.href),
    [
      "/",
      "/directions",
      "/research",
      "/facilities",
      "/team",
      "/news",
      "/contact",
    ],
  );
  assert.equal(
    publicNavigation.find((item) => item.href === "/research")?.label.zh,
    "论文成果",
  );
});
