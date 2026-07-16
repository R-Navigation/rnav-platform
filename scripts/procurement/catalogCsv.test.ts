import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCatalogRow, normalizeCatalogRows, type CatalogCsvRow } from "./catalogCsv.js";

const row = (overrides: Partial<CatalogCsvRow>): CatalogCsvRow => ({ source_sku: "100053385015", source_url: "https://item.jd.com/100053385015.html", option_sku: "100044342282", option_url: "https://item.jd.com/100044342282.html", is_current_link: "False", brandName: "固万基", skuName: "商品", option_values: "型号=304不锈钢内六角圆柱头螺钉；规格=HM4x32[20个]；货期=1-5天", price: "", price_status: "需登录查看价格", price_note: "", ...overrides });

test("normalizes a JD screw option as one purchasable package", () => {
  const item = normalizeCatalogRow(row({}));
  assert.equal(item.sku, "JD-100044342282");
  assert.equal(item.categoryCode, "bolts");
  assert.equal(item.spec, "M4x32 · 304不锈钢 · 20个/包 · 货期1-5天");
  assert.equal(item.unit, "包");
  assert.equal(item.packSize, 1);
  assert.equal(item.estimatedUnitPrice, null);
  assert.deepEqual({ thread: item.specMetadata.thread, lengthMm: item.specMetadata.lengthMm, packQuantity: item.specMetadata.packQuantity }, { thread: "M4", lengthMm: 32, packQuantity: 20 });
});

test("extracts washer and male-female standoff dimensions by product family", () => {
  const washer = normalizeCatalogRow(row({ source_sku: "100053385755", option_sku: "100053385877", option_values: "型号=304平垫圈；规格=M6x20x1.5[50个]；货期=1-5天" }));
  assert.equal(washer.specMetadata.outerDiameterMm, 20);
  assert.equal(washer.specMetadata.thicknessMm, 1.5);
  const standoff = normalizeCatalogRow(row({ source_sku: "100044811888", option_sku: "100044812144", option_values: "公称直径=铜单通型六角隔离柱；公称长度=M2.5x20+6[10个]；货期=1-5天" }));
  assert.equal(standoff.specMetadata.bodyLengthMm, 20);
  assert.equal(standoff.specMetadata.maleThreadLengthMm, 6);
});

test("keeps across-flats dimensions that distinguish otherwise identical standoffs", () => {
  const item = normalizeCatalogRow(row({ source_sku: "100345313878", option_sku: "100345313878", option_values: "公称直径=M3x50（对边5）[10个/包]；公称长度=304不锈钢双通六角柱" }));
  assert.equal(item.specMetadata.hexWidthMm, 5);
  assert.match(item.spec, /对边5mm/);
});

test("normalizes public-only socket screw products without price data", () => {
  const small = normalizeCatalogRow(row({ source_sku: "100202715039", option_sku: "100268396406", option_values: "型号=M6x200[5个/包]", price: "", price_status: "" }));
  assert.equal(small.categoryCode, "bolts");
  assert.equal(small.spec, "M6x200 · 304不锈钢 · 5个/包");
  assert.equal(small.estimatedUnitPrice, null);
  const bulk = normalizeCatalogRow(row({ source_sku: "100112164913", option_sku: "100112165067", option_values: "型号=M3x8[500个/包]", price: "", price_status: "" }));
  assert.equal(bulk.specMetadata.standard, "GB/T 70.1");
  assert.equal(bulk.specMetadata.packQuantity, 500);
});

test("preserves special nut variants and parses an available package price", () => {
  const item = normalizeCatalogRow(row({ source_sku: "100044346892", option_sku: "100053388107", option_values: "型号=非金属嵌件锁紧螺母；规格=M10x1.25牙[10个/包]304细牙；货期=1-5天", price: "19.90" }));
  assert.equal(item.specMetadata.thread, "M10");
  assert.equal(item.specMetadata.threadPitchMm, 1.25);
  assert.equal(item.specMetadata.packQuantity, 10);
  assert.equal(item.estimatedUnitPrice, 19.9);
  assert.match(item.spec, /304不锈钢/);
  assert.match(item.spec, /细牙/);
});

test("rejects unknown product families and duplicate option SKUs", () => {
  assert.throws(() => normalizeCatalogRow(row({ source_sku: "unknown" })), /Unsupported source SKU/);
  assert.throws(() => normalizeCatalogRows([row({}), row({})]), /Duplicate SKU/);
});
