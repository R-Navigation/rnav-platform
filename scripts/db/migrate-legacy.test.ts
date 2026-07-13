import assert from "node:assert/strict";
import test from "node:test";
import { transformUsers } from "./migrate-legacy.js";

test("username mappings merge website and monitor administrators", () => {
  const result = transformUsers([{ id: 1, username: "admin", password_hash: "site" }], [{ id: "m1", username: "aaron", password_hash: "monitor", role: "admin", display_name: "Aaron", is_active: true }], { users: [{ unifiedUsername: "aaron", websiteAdminUsername: "admin", monitorUsername: "aaron", baseTier: "super" }] });
  assert.equal(result.users.length, 1); assert.deepEqual(result.users[0].sources, ["website", "monitor"]); assert.equal(result.conflicts.length, 0);
});

test("unmapped username collisions are renamed and recorded deterministically", () => {
  const result = transformUsers([{ id: 1, username: "admin", password_hash: "site" }], [{ id: "m1", username: "admin", password_hash: "monitor", role: "admin", display_name: "Monitor Admin", is_active: true }], { users: [] });
  assert.deepEqual(result.users.map((user) => user.username), ["admin", "admin-monitor"]); assert.equal(result.conflicts[0].type, "username-collision");
});
