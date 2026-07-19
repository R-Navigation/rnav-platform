import assert from "node:assert/strict";
import test from "node:test";
import { addCatalogItem, availableActions, cartEstimatedTotal, groupProcurementItems, processingCompletionBlockers, procurementCapabilities, updateCartQuantity, type CatalogItem } from "./model.ts";

test("normal members can create and only see requester actions", () => {
  const capability = procurementCapabilities(["procurements.create", "procurements.read_own"]);
  assert.equal(capability.create, true);
  assert.equal(capability.readAll, false);
  assert.deepEqual(availableActions("submitted", capability, true), [{ action: "cancel", label: "撤回申请" }]);
});

test("advanced procurement permissions expose only their workflow stage", () => {
  const reviewer = procurementCapabilities(["procurements.review"]);
  assert.deepEqual(availableActions("submitted", reviewer, false).map((item) => item.action), ["approve", "reject"]);
  const purchaser = procurementCapabilities(["procurements.purchase"]);
  assert.deepEqual(availableActions("submitted", purchaser, false), []);
});

const bolt: CatalogItem = { id: "bolt-1", categoryId: "category-1", categoryCode: "bolts", categoryNameZh: "螺栓", subcategoryId: "subcategory-1", subcategoryCode: "socket-head-cap-screw", subcategoryNameZh: "内六角圆柱头螺钉", sku: "BOLT-M6X20", nameZh: "内六角圆柱头螺钉", nameEn: "", spec: "M6x20", specMetadata: {}, unit: "个", packSize: 10, estimatedUnitPrice: 0.8, vendor: null, url: null, keywords: [], imageAssetId: null, imageUrl: null, isActive: true };

test("adding the same standard part merges its quantity using the pack size", () => {
  const once = addCatalogItem([], bolt);
  const twice = addCatalogItem(once, bolt);
  assert.equal(twice.length, 1);
  assert.equal(twice[0].quantity, 20);
  assert.equal(cartEstimatedTotal(twice), 16);
});

test("setting a cart quantity to zero removes the line", () => {
  assert.deepEqual(updateCartQuantity(addCatalogItem([], bolt), "catalog:bolt-1", 0), []);
});

test("procurement lines are grouped by primary and secondary category", () => {
  const grouped = groupProcurementItems([
    { id: "washer", source_type: "catalog" as const, catalog_snapshot: { categoryNameZh: "垫圈", subcategoryNameZh: "平垫圈" } },
    { id: "bolt", source_type: "catalog" as const, catalog_snapshot: { categoryNameZh: "螺栓", subcategoryNameZh: "内六角圆柱头螺钉" } },
    { id: "custom", source_type: "custom" as const, catalog_snapshot: {} },
    { id: "nut", source_type: "catalog" as const, catalog_snapshot: { categoryNameZh: "螺母", subcategoryNameZh: "六角螺母" } },
  ]);

  assert.deepEqual(grouped.map((group) => group.category), ["垫圈", "螺母", "螺栓", "其他物料"]);
  assert.equal(grouped[2].subcategories[0].subcategory, "内六角圆柱头螺钉");
  assert.equal(grouped[3].subcategories[0].subcategory, "手动填写");
});

test("processing completion explains every blocking draft condition", () => {
  const blockers = processingCompletionBlockers(
    ["pending", "rejected", "purchased"],
    {
      pending: { status: "pending", rejectionReason: "" },
      rejected: { status: "rejected", rejectionReason: "" },
      purchased: { status: "purchased", rejectionReason: "" },
    },
    [{ scope: "items", itemIds: ["rejected"], amount: "12.345" }],
  );
  assert.equal(blockers.length, 4);
  assert.ok(blockers.some((item) => item.includes("未标记")));
  assert.ok(blockers.some((item) => item.includes("驳回意见")));
  assert.ok(blockers.some((item) => item.includes("金额")));
  assert.ok(blockers.some((item) => item.includes("已购买")));
});

test("processing completion accepts completed lines without spending records", () => {
  assert.deepEqual(processingCompletionBlockers(
    ["purchased", "rejected"],
    {
      purchased: { status: "purchased", rejectionReason: "" },
      rejected: { status: "rejected", rejectionReason: "无法购买" },
    },
    [],
  ), []);
});

test("processing completion rejects request totals when every line is rejected", () => {
  const blockers = processingCompletionBlockers(
    ["rejected"],
    { rejected: { status: "rejected", rejectionReason: "无货" } },
    [{ scope: "request_total", itemIds: [], amount: "10.00" }],
  );
  assert.ok(blockers.some((item) => item.includes("没有已购买条目")));
});
