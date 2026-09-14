import assert from "node:assert/strict";
import test from "node:test";
import { createUserSchema, importUsersSchema } from "./userSchemas.js";

test("person accounts require an academic stage but allow a missing account email", () => {
  assert.equal(createUserSchema.safeParse({
    username: "person-one",
    nameZh: "成员一",
    nameEn: "",
    academicStage: "master",
    email: "",
    accountKind: "person",
  }).success, true);
  assert.equal(createUserSchema.safeParse({
    username: "person-two",
    nameZh: "成员二",
    nameEn: "",
    academicStage: "",
    email: "",
    accountKind: "person",
  }).success, false);
});

test("system accounts require only a display name and optional account email", () => {
  assert.equal(createUserSchema.safeParse({
    username: "system-one",
    nameZh: "采集服务",
    nameEn: "",
    email: "",
    accountKind: "system",
  }).success, true);
});

test("member import uses academicStage and accepts multiple blank account emails", () => {
  const row = (username: string) => ({
    username,
    nameZh: username,
    nameEn: "",
    academicStage: "phd",
    email: "",
    publicEmail: "",
    baseTier: "normal",
  });
  assert.equal(importUsersSchema.safeParse({ rows: [row("member-one"), row("member-two")] }).success, true);
  assert.equal(importUsersSchema.safeParse({ rows: [{ ...row("member-three"), memberCategory: "phd" }] }).success, false);
});
