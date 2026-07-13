import assert from "node:assert/strict";
import test from "node:test";
import { createProcurementSchema, transitionSchema } from "./schemas.js";

test("a procurement request requires at least one valid item", () => {
  assert.equal(createProcurementSchema.safeParse({ title: "相机", reason: "实验", items: [] }).success, false);
  assert.equal(createProcurementSchema.safeParse({ title: "相机", reason: "实验", items: [{ itemName: "D455", quantity: 2, estimatedUnitPrice: 1500 }] }).success, true);
});

test("transition payloads reject unknown actions", () => {
  assert.equal(transitionSchema.safeParse({ action: "teleport" }).success, false);
  assert.equal(transitionSchema.safeParse({ action: "approve", note: "预算内" }).success, true);
});
