import assert from "node:assert/strict";
import test from "node:test";
import { extractItemOnly, publicItemRows } from "./scrape-jd-public.js";

test("extracts the public JD item payload without evaluating page scripts", () => {
  const html = `<script>window._itemOnly = ({"item":{"skuId":"100","skuName":"螺钉","brandName":"品牌","image":["a.jpg"],"saleProp":{"1":"型号"},"newColorSize":[{"1":"M3x8[100个/包]","skuId":"101"}]}});</script>`;
  assert.equal(extractItemOnly(html).item.newColorSize[0].skuId, "101");
});

test("converts public options to the existing price-free CSV contract", () => {
  const rows = publicItemRows("100", { skuId: "100", skuName: "螺钉", brandName: "品牌", saleProp: { "1": "型号" }, newColorSize: [{ "1": "M3x8[100个/包]", skuId: "101" }] });
  assert.deepEqual(rows[0], { source_sku: "100", source_url: "https://item.jd.com/100.html", option_sku: "101", option_url: "https://item.jd.com/101.html", is_current_link: "false", brandName: "品牌", skuName: "螺钉", option_values: "型号=M3x8[100个/包]", price: "", price_status: "", price_note: "按要求仅抓取公开商品规格，未抓取价格或登录后信息" });
});

test("rejects pages that do not contain the public item payload", () => {
  assert.throws(() => extractItemOnly("<html>京东安全验证</html>"), /payload was not found/);
});
