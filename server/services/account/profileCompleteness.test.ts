import assert from "node:assert/strict";
import test from "node:test";
import { profileCompleteness } from "./profileCompleteness.js";

const complete = { memberStatus: "current" as const, publicVisible: true, publicFields: ["name_zh"], nameZh: "张三", nameEn: "", avatarAssetId: "asset", academicStage: "phd", enrollmentYear: "2024", graduationYear: "", majorZh: "自动化", majorEn: "", researchInterestsZh: "导航", researchInterestsEn: "", destinationZh: "", destinationEn: "" };
test("current member completeness covers public essentials", () => assert.deepEqual(profileCompleteness(complete), { missing: [], complete: true, publishable: true }));
test("alumni require graduation and destination", () => {
  const result = profileCompleteness({ ...complete, memberStatus: "alumni", enrollmentYear: "", graduationYear: "", destinationZh: "" });
  assert.deepEqual(result.missing, ["graduationYear", "destination"]);
});

test("publishability only requires visibility and a name, independently of completeness", () => {
  const result = profileCompleteness({ ...complete, avatarAssetId: null, majorZh: "", researchInterestsZh: "" });
  assert.equal(result.complete, false);
  assert.equal(result.publishable, true);
});

test("publishability requires the populated name to be selected for publication", () => {
  assert.equal(profileCompleteness({ ...complete, publicFields: [] }).publishable, false);
});
