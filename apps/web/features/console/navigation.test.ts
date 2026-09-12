import assert from "node:assert/strict";
import test from "node:test";
import { groupConsoleModules, isConsoleRouteActive } from "./navigation.ts";

test("matches the console home exactly", () => {
  assert.equal(isConsoleRouteActive("/console", "/console"), true);
  assert.equal(isConsoleRouteActive("/console/profile", "/console"), false);
});

test("matches module routes exactly and through nested pages", () => {
  assert.equal(
    isConsoleRouteActive("/console/profile", "/console/profile"),
    true,
  );
  assert.equal(
    isConsoleRouteActive("/console/profile/security", "/console/profile"),
    true,
  );
});

test("does not match sibling routes with a shared prefix", () => {
  assert.equal(
    isConsoleRouteActive("/console/profiled", "/console/profile"),
    false,
  );
  assert.equal(
    isConsoleRouteActive("/console/media-library", "/console/media"),
    false,
  );
});

test("groups only available modules into task-oriented navigation sections", () => {
  const groups = groupConsoleModules([
    { key: "profile", href: "/console/profile", label: "个人资料" },
    { key: "procurements", href: "/console/procurements", label: "采购事务" },
    { key: "site", href: "/console/site", label: "官网内容" },
    { key: "users", href: "/console/users", label: "用户管理" },
    { key: "permissions", href: "/console/permissions", label: "权限管理" },
  ]);
  assert.deepEqual(
    groups.map((group) => ({
      label: group.label,
      keys: group.modules.map((module) => module.key),
    })),
    [
      { label: "我的事务", keys: ["profile", "procurements"] },
      { label: "实验与展示", keys: ["site"] },
      { label: "系统管理", keys: ["members"] },
    ],
  );
});
