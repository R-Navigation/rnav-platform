import assert from "node:assert/strict";
import test from "node:test";
import { addCatalogItem, availableActions, cartEstimatedTotal, procurementCapabilities, updateCartQuantity, type CatalogItem } from "./model.ts";

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
  assert.deepEqual(availableActions("approved", purchaser, false).map((item) => item.action), ["start_purchase"]);
});

const bolt: CatalogItem = { id: "bolt-1", categoryId: "category-1", categoryCode: "bolts", categoryNameZh: "螺栓", sku: "BOLT-M6X20", nameZh: "内六角圆柱头螺钉", nameEn: "", spec: "M6x20", specMetadata: {}, unit: "个", packSize: 10, estimatedUnitPrice: 0.8, vendor: null, url: null, keywords: [], imageAssetId: null, imageUrl: null, isActive: true };

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
