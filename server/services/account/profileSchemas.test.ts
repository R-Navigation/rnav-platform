import assert from "node:assert/strict";
import test from "node:test";
import { adminProfileUpdateSchema, profileUpdateSchema } from "./profileSchemas.js";

const valid = {
  version: 1, nameZh: "张三", nameEn: "San Zhang",
  publicEmail: "a@example.com", phone: "123", bioZh: "简介", bioEn: "Bio", researchInterestsZh: "导航",
  researchInterestsEn: "Navigation", enrollmentYear: "2024", graduationYear: "", majorZh: "自动化",
  majorEn: "Automation", thesisZh: "", thesisEn: "", destinationZh: "", destinationEn: "",
  avatarAssetId: null, avatarPositionX: 50, avatarPositionY: 50, avatarZoom: 1,
  personalLinks: [{ labelZh: "代码", labelEn: "Code", url: "https://github.com/a" }],
  publicFields: ["name_zh", "email", "links"],
};

test("self profile accepts all granular public fields but rejects governance fields", () => {
  assert.equal(profileUpdateSchema.safeParse(valid).success, true);
  assert.equal(profileUpdateSchema.safeParse({ ...valid, publicFields: ["academic_stage", "enrollment_year", "graduation_year", "phone"] }).success, true);
  assert.equal(profileUpdateSchema.safeParse({ ...valid, memberStatus: "alumni" }).success, false);
  assert.equal(profileUpdateSchema.safeParse({ ...valid, academicStage: "master" }).success, false);
  assert.equal(profileUpdateSchema.safeParse({ ...valid, publicVisible: false }).success, false);
  assert.equal(profileUpdateSchema.safeParse({ ...valid, personalLinks: [{ labelZh: "脚本", labelEn: "", url: "javascript:alert(1)" }] }).success, false);
  assert.equal(profileUpdateSchema.safeParse({ ...valid, avatarZoom: 3.1 }).success, false);
  assert.equal(profileUpdateSchema.safeParse({ ...valid, extra: true }).success, false);
});

test("admin profile accepts governance fields and enforces a public name", () => {
  const admin = { ...valid, memberStatus: "current", academicStage: "phd", publicVisible: true };
  assert.equal(adminProfileUpdateSchema.safeParse(admin).success, true);
  assert.equal(adminProfileUpdateSchema.safeParse({ ...admin, publicFields: ["phone"] }).success, false);
});
