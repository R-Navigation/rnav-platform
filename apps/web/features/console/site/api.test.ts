import assert from "node:assert/strict";
import test from "node:test";
import { parseSiteAdminError } from "./api.ts";

test("API errors expose validation issue paths and messages", () => {
  assert.equal(parseSiteAdminError({
    error: "Validation failed",
    issues: [{ path: ["items", 1, "slug"], message: "Duplicate slug" }],
  }, 400), "Validation failed: items.1.slug - Duplicate slug");
});

test("API errors have useful status fallbacks", () => {
  assert.equal(parseSiteAdminError({}, 401), "登录状态已失效，请重新登录。");
  assert.equal(parseSiteAdminError({}, 403), "当前账号没有执行此操作的权限。");
  assert.equal(parseSiteAdminError({}, 409), "内容已被其他人更新，请重新加载最新版本。");
  assert.equal(parseSiteAdminError({}, 502), "官网管理服务暂时不可用，请稍后重试。");
});
