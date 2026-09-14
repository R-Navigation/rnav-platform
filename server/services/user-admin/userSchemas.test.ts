import assert from "node:assert/strict";
import test from "node:test";
import { createUserSchema, importUsersSchema } from "./userSchemas.js";

test("person accounts require an academic stage but allow a missing account email", () => {
  assert.equal(createUserSchema.safeParse({
    username: "huangzixuan",
    nameZh: "黄子旋",
    nameEn: "Zixuan-Huang",
    academicStage: "master",
    email: "",
    accountKind: "person",
  }).success, true);
  assert.equal(createUserSchema.safeParse({
    username: "zhangsan",
    nameZh: "张三",
    nameEn: "San-Zhang",
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
  const row = (username: string, nameZh: string, nameEn: string) => ({
    username,
    nameZh,
    nameEn,
    academicStage: "phd",
    email: "",
    publicEmail: "",
    baseTier: "normal",
  });
  assert.equal(importUsersSchema.safeParse({ rows: [row("zhangsan", "张三", "San-Zhang"), row("lisi", "李四", "Si-Li")] }).success, true);
  assert.equal(importUsersSchema.safeParse({ rows: [{ ...row("wangwu", "王五", "Wu-Wang"), memberCategory: "phd" }] }).success, false);
});

test("person account identity fields must match the normalized Chinese name", () => {
  const base = { username: "huangzixuan", nameZh: "黄子旋", nameEn: "Zixuan-Huang", academicStage: "master", accountKind: "person" };
  assert.equal(createUserSchema.safeParse(base).success, true);
  assert.equal(createUserSchema.safeParse({ ...base, username: "zixuan-huang" }).success, false);
  assert.equal(createUserSchema.safeParse({ ...base, nameEn: "Zixuan Huang" }).success, false);
  assert.equal(createUserSchema.safeParse({ ...base, nameZh: "黄子旋同学" }).success, false);
});
