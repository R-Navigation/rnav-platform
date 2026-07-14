import assert from "node:assert/strict";
import test from "node:test";
import { profileUpdateSchema } from "./profileSchemas.js";

const valid = { version: 1, nameZh: "张三", nameEn: "San Zhang", titleZh: "博士生", titleEn: "PhD Student", email: "a@example.com", phone: "123", bioZh: "简介", bioEn: "Bio", researchInterestsZh: "导航", researchInterestsEn: "Navigation", homepageUrl: "", githubUrl: "https://github.com/a", avatarAssetId: null, publicFields: ["name_zh", "email"] };
test("profile schema accepts approved public fields and rejects phone or unknown fields", () => {
  assert.equal(profileUpdateSchema.safeParse(valid).success, true);
  assert.equal(profileUpdateSchema.safeParse({ ...valid, publicFields: ["phone"] }).success, false);
  assert.equal(profileUpdateSchema.safeParse({ ...valid, extra: true }).success, false);
});
