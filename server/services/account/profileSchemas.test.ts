import assert from "node:assert/strict";
import test from "node:test";
import { profileUpdateSchema } from "./profileSchemas.js";

const valid = {
  version: 1, memberStatus: "current", degreeLevel: "phd", nameZh: "张三", nameEn: "San Zhang",
  email: "a@example.com", phone: "123", bioZh: "简介", bioEn: "Bio", researchInterestsZh: "导航",
  researchInterestsEn: "Navigation", enrollmentYear: "2024", graduationYear: "", majorZh: "自动化",
  majorEn: "Automation", thesisZh: "", thesisEn: "", destinationZh: "", destinationEn: "",
  avatarAssetId: null, avatarPositionX: 50, avatarPositionY: 50, avatarZoom: 1,
  personalLinks: [{ labelZh: "代码", labelEn: "Code", url: "https://github.com/a" }],
  publicFields: ["name_zh", "email", "links"],
};

test("profile schema accepts self-managed academic fields and arbitrary HTTP links", () => {
  assert.equal(profileUpdateSchema.safeParse(valid).success, true);
  assert.equal(profileUpdateSchema.safeParse({ ...valid, publicFields: ["phone"] }).success, false);
  assert.equal(profileUpdateSchema.safeParse({ ...valid, personalLinks: [{ labelZh: "脚本", labelEn: "", url: "javascript:alert(1)" }] }).success, false);
  assert.equal(profileUpdateSchema.safeParse({ ...valid, avatarZoom: 3.1 }).success, false);
  assert.equal(profileUpdateSchema.safeParse({ ...valid, extra: true }).success, false);
});
