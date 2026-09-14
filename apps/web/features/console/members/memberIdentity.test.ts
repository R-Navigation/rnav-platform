import assert from "node:assert/strict";
import test from "node:test";
import { personIdentityFromChineseName } from "./memberIdentity.ts";

test("member form derives normalized Chinese, username, and English identities", () => {
  assert.deepEqual(personIdentityFromChineseName("黄子旋"), {
    nameZh: "黄子旋",
    username: "huangzixuan",
    nameEn: "Zixuan-Huang",
  });
  assert.deepEqual(personIdentityFromChineseName("仇宏煜"), {
    nameZh: "仇宏煜",
    username: "qiuhongyu",
    nameEn: "Hongyu-Qiu",
  });
  assert.equal(personIdentityFromChineseName("李由教授"), null);
});
