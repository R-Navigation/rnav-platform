import assert from "node:assert/strict";
import test from "node:test";
import { personIdentityFromChineseName } from "./memberIdentity.js";

test("person identity uses surname-first username and given-name-first English name", () => {
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
  assert.deepEqual(personIdentityFromChineseName("欧阳娜娜"), {
    nameZh: "欧阳娜娜",
    username: "ouyangnana",
    nameEn: "Nana-Ouyang",
  });
});

test("person identity rejects titles, Latin names, and one-character values", () => {
  assert.equal(personIdentityFromChineseName("李由教授"), null);
  assert.equal(personIdentityFromChineseName("You Li"), null);
  assert.equal(personIdentityFromChineseName("李"), null);
});
