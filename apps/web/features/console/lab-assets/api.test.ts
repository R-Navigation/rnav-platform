import assert from "node:assert/strict";
import test from "node:test";
import { parseLabAssetsError } from "./api.ts";

test("lab assets errors expose validation paths and conflict guidance", () => {
  assert.equal(parseLabAssetsError({ error: "Validation failed", issues: [{ path: ["name", "zh"], message: "Required" }] }, 400), "Validation failed: name.zh - Required");
  assert.equal(parseLabAssetsError({}, 409), "数据已被其他成员更新，请重新加载后再试。");
  assert.equal(parseLabAssetsError({ error: "Lab assets revision conflict" }, 409), "数据已被其他成员更新，请重新加载后再试。");
});

test("lab assets errors provide useful auth and availability fallbacks", () => {
  assert.equal(parseLabAssetsError({}, 401), "登录状态已失效，请重新登录。");
  assert.equal(parseLabAssetsError({}, 403), "当前账号没有执行此操作的权限。");
  assert.equal(parseLabAssetsError({}, 502), "实验室资产服务暂时不可用，请稍后重试。");
});

test("lab assets import validation errors keep row-level guidance", () => {
  assert.equal(parseLabAssetsError({ error: "Asset import validation failed" }, 422), "Asset import validation failed");
});
