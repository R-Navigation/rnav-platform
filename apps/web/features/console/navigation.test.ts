import assert from "node:assert/strict";
import test from "node:test";
import { isConsoleRouteActive } from "./navigation.ts";

test("matches the console home exactly", () => {
  assert.equal(isConsoleRouteActive("/console", "/console"), true);
  assert.equal(isConsoleRouteActive("/console/profile", "/console"), false);
});

test("matches module routes exactly and through nested pages", () => {
  assert.equal(isConsoleRouteActive("/console/profile", "/console/profile"), true);
  assert.equal(isConsoleRouteActive("/console/profile/security", "/console/profile"), true);
});

test("does not match sibling routes with a shared prefix", () => {
  assert.equal(isConsoleRouteActive("/console/profiled", "/console/profile"), false);
  assert.equal(isConsoleRouteActive("/console/media-library", "/console/media"), false);
});
