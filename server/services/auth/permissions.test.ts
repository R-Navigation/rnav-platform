import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveDisplayTier,
  getConsoleModules,
  getEffectivePermissions,
  knownPermissionKeys
} from "./permissions.js";

test("deriveDisplayTier returns super for super users", () => {
  assert.equal(deriveDisplayTier("super", []), "super");
});

test("deriveDisplayTier returns plus when a normal user has an advanced permission", () => {
  assert.equal(deriveDisplayTier("normal", ["site.content.write"]), "plus");
});

test("deriveDisplayTier returns normal when a normal user has only base permissions", () => {
  assert.equal(
    deriveDisplayTier("normal", ["console.access", "procurements.create"]),
    "normal"
  );
});

test("getConsoleModules returns procurement for normal members", () => {
  const modules = getConsoleModules([
    "console.access",
    "procurements.create",
    "procurements.read_own"
  ]);
  assert.ok(modules.some((module) => module.key === "procurements"));
});

test("procurement operators inherit read-all access needed for their workflow", () => {
  for (const permission of ["procurements.review", "procurements.purchase", "procurements.close"]) {
    assert.ok(getEffectivePermissions([permission]).includes("procurements.read_all"));
  }
});

test("getConsoleModules returns users for permission managers", () => {
  const modules = getConsoleModules(["users.read", "permissions.write"]);
  assert.ok(modules.some((module) => module.key === "users"));
  assert.ok(modules.some((module) => module.key === "permissions"));
});

test("every known permission maps to its console module", () => {
  const expectedModuleByPermission: Record<string, string> = {
    "console.access": "profile",
    "profile.read_own": "profile",
    "profile.write_own": "profile",
    "lab_assets.read": "lab-assets",
    "lab_assets.write": "lab-assets",
    "procurements.create": "procurements",
    "procurements.read_own": "procurements",
    "procurements.read_all": "procurements",
    "procurements.review": "procurements",
    "procurements.purchase": "procurements",
    "procurements.close": "procurements",
    "monitor.devices.read": "monitor",
    "monitor.devices.write": "monitor",
    "monitor.settings.write": "monitor",
    "site.content.write": "site",
    "site.members.write": "site",
    "site.media.write": "media",
    "users.read": "users",
    "users.write": "users",
    "permissions.write": "permissions",
    "system.settings.write": "settings"
  };

  assert.deepEqual(Object.keys(expectedModuleByPermission).sort(), [
    ...knownPermissionKeys
  ].sort());
  for (const permission of knownPermissionKeys) {
    assert.equal(
      getConsoleModules([permission]).some(
        (module) => module.key === expectedModuleByPermission[permission]
      ),
      true,
      `${permission} should expose ${expectedModuleByPermission[permission]}`
    );
  }
});
