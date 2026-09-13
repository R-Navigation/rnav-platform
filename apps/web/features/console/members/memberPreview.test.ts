import assert from "node:assert/strict";
import test from "node:test";
import { memberPreview } from "./memberPreview.ts";
import type { Member } from "./MemberManagement";
const member = {
  publicFields: [],
  memberStatus: "current",
  degreeLevel: "master",
  nameZh: "成员",
  nameEn: "Member",
  publicEmail: "public@example.com",
  email: "PRIVATE_ACCOUNT",
  phone: "PRIVATE_PHONE",
  avatarUrl: "https://example.com/photo.jpg",
  personalLinks: [],
  bioZh: "介绍",
  bioEn: "Bio",
  enrollmentYear: "2026",
  graduationYear: "2028",
  thesisZh: "论文",
  thesisEn: "Thesis",
  destinationZh: "去向",
  destinationEn: "Destination",
} as unknown as Member;
test("preview omits all unchecked fields and never exposes private account contact data", () => {
  const hidden = memberPreview(member);
  assert.deepEqual(hidden.name, { zh: "", en: "" });
  assert.deepEqual(hidden.degree, { zh: "", en: "" });
  assert.equal(hidden.image, null);
  const visible = memberPreview({
    ...member,
    publicFields: ["name_zh", "academic", "email", "avatar"],
  });
  assert.deepEqual(visible.name, { zh: "成员", en: "" });
  assert.equal(visible.enrollmentYear, "2026");
  assert.doesNotMatch(JSON.stringify(visible), /PRIVATE_ACCOUNT|PRIVATE_PHONE/);
});
test("preview only publishes graduation, thesis and destination for alumni", () => {
  const fields = ["academic", "thesis", "destination"];
  assert.equal(memberPreview({ ...member, publicFields: fields }).thesis, null);
  const alumni = memberPreview({
    ...member,
    memberStatus: "alumni",
    publicFields: fields,
  });
  assert.equal(alumni.graduation?.zh, "2028届硕士");
  assert.equal(alumni.thesis?.en, "Thesis");
  assert.equal(alumni.enrollmentYear, "");
});
