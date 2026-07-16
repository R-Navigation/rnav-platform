import assert from "node:assert/strict";
import test from "node:test";
import { catalogItemSchema, catalogQuerySchema, createProcurementSchema, transitionSchema } from "./schemas.js";

test("a procurement request requires at least one valid item", () => {
  assert.equal(createProcurementSchema.safeParse({ title: "相机", reason: "实验", items: [] }).success, false);
  assert.equal(createProcurementSchema.safeParse({ title: "相机", reason: "实验", items: [{ itemName: "D455", quantity: 2, estimatedUnitPrice: 1500 }] }).success, true);
});

test("a procurement request accepts catalog and custom items together", () => {
  const result = createProcurementSchema.safeParse({
    title: "标准件补充",
    reason: "机器人装配",
    items: [
      { sourceType: "catalog", catalogItemId: "00000000-0000-4000-8000-000000000011", quantity: 20, remark: "黑色" },
      { sourceType: "custom", itemName: "定制转接板", spec: "铝合金 5mm", unit: "块", quantity: 2 },
    ],
  });
  assert.equal(result.success, true);
});

test("catalog references cannot smuggle browser supplied names or prices", () => {
  const result = createProcurementSchema.safeParse({
    title: "标准件补充",
    reason: "机器人装配",
    items: [{ sourceType: "catalog", catalogItemId: "00000000-0000-4000-8000-000000000011", itemName: "伪造名称", estimatedUnitPrice: 0.01, quantity: 20 }],
  });
  assert.equal(result.success, false);
});

test("catalog query and item administration payloads are bounded", () => {
  assert.equal(catalogQuerySchema.safeParse({ search: "M6", includeInactive: "false", limit: "50", offset: "100" }).success, true);
  assert.equal(catalogQuerySchema.safeParse({ limit: "500" }).success, false);
  assert.equal(catalogItemSchema.safeParse({ categoryId: "00000000-0000-4000-8000-000000000011", nameZh: "内六角圆柱头螺钉", spec: "M6x20", unit: "个", packSize: 1, keywords: ["螺栓", "M6"] }).success, true);
  assert.equal(catalogItemSchema.safeParse({ categoryId: "not-a-uuid", nameZh: "螺钉", unit: "个" }).success, false);
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
