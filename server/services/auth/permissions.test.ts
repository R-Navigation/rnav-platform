import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveDisplayTier,
  getConsoleModules,
  getEffectivePermissions,
  knownPermissionKeys,
  resolvePermissions
  ,restrictAlumniPermissions
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
  const modules = getConsoleModules([]);
  assert.ok(modules.some((module) => module.key === "procurements"));
});

test("normal base permissions are immutable and reported as base sources", () => {
  const result = resolvePermissions({
    baseTier: "normal",
    explicitRevokes: ["console.access", "profile.write_own"]
  });

  assert.ok(result.permissions.includes("console.access"));
  assert.deepEqual(result.sources["console.access"], [{ type: "base" }]);
});

test("templates, grants, and revokes resolve in the approved order", () => {
  const result = resolvePermissions({
    baseTier: "normal",
    templatePermissions: [
      { permissionKey: "site.content.write", templateKey: "site-editor" },
      { permissionKey: "site.media.write", templateKey: "site-editor" }
    ],
    explicitGrants: ["monitor.devices.read"],
    explicitRevokes: ["site.media.write"]
  });

  assert.ok(result.permissions.includes("site.content.write"));
  assert.ok(result.permissions.includes("monitor.devices.read"));
  assert.equal(result.permissions.includes("site.media.write"), false);
  assert.deepEqual(result.sources["site.content.write"], [
    { type: "template", templateKey: "site-editor" }
  ]);
  assert.deepEqual(result.sources["monitor.devices.read"], [{ type: "grant" }]);
  assert.deepEqual(result.sources["site.media.write"], [{ type: "revoke" }]);
});

test("super receives every known permission with a super source", () => {
  const result = resolvePermissions({ baseTier: "super" });
  assert.deepEqual(result.permissions.sort(), [...knownPermissionKeys].sort());
  assert.deepEqual(result.sources["system.settings.write"], [{ type: "super" }]);
});

test("procurement operators inherit read-all access needed for their workflow", () => {
  for (const permission of ["procurements.review", "procurements.purchase", "procurements.close"]) {
    assert.ok(getEffectivePermissions([permission]).includes("procurements.read_all"));
  }
});

test("alumni retain profile access but lose ordinary internal member access", () => {
  const permissions = restrictAlumniPermissions(resolvePermissions({ baseTier: "normal" }).permissions, "normal");
  assert.ok(permissions.includes("console.access"));
  assert.ok(permissions.includes("profile.write_own"));
  assert.equal(permissions.includes("lab_assets.read"), false);
  assert.equal(permissions.includes("procurements.create"), false);
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
