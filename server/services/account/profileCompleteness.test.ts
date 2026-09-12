import assert from "node:assert/strict";
import test from "node:test";
import { profileCompleteness } from "./profileCompleteness.js";

const complete = { memberStatus: "current" as const, publicVisible: true, nameZh: "张三", nameEn: "", avatarAssetId: "asset", degreeLevel: "phd", enrollmentYear: "2024", graduationYear: "", majorZh: "自动化", majorEn: "", researchInterestsZh: "导航", researchInterestsEn: "", destinationZh: "", destinationEn: "" };
test("current member completeness covers public essentials", () => assert.deepEqual(profileCompleteness(complete), { missing: [], complete: true, publishable: true }));
test("alumni require graduation and destination", () => {
  const result = profileCompleteness({ ...complete, memberStatus: "alumni", enrollmentYear: "", graduationYear: "", destinationZh: "" });
  assert.deepEqual(result.missing, ["graduationYear", "destination"]);
});

