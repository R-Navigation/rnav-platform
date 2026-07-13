import assert from "node:assert/strict";
import test from "node:test";
import { createProcurementSchema, transitionSchema } from "./schemas.js";

test("a procurement request requires at least one valid item", () => {
  assert.equal(createProcurementSchema.safeParse({ title: "相机", reason: "实验", items: [] }).success, false);
  assert.equal(createProcurementSchema.safeParse({ title: "相机", reason: "实验", items: [{ itemName: "D455", quantity: 2, estimatedUnitPrice: 1500 }] }).success, true);
});

test("amounts fit PostgreSQL numeric precision and use at most two decimals", () => {
  assert.equal(createProcurementSchema.safeParse({ title: "相机", reason: "实验", items: [{ itemName: "D455", quantity: 0.001, estimatedUnitPrice: 1 }] }).success, false);
  assert.equal(createProcurementSchema.safeParse({ title: "相机", reason: "实验", items: [{ itemName: "D455", quantity: 1, estimatedUnitPrice: 1.001 }] }).success, false);
  assert.equal(createProcurementSchema.safeParse({ title: "相机", reason: "实验", items: [{ itemName: "D455", quantity: 1_000_000, estimatedUnitPrice: 100_000_000 }] }).success, false);
});

test("transition payloads reject unknown actions", () => {
  assert.equal(transitionSchema.safeParse({ action: "teleport" }).success, false);
  assert.equal(transitionSchema.safeParse({ action: "approve", note: "预算内" }).success, true);
});
