import assert from "node:assert/strict";
import test from "node:test";
import {
  adminRedirects,
  applyConflictSnapshot,
  applySavedModule,
  createSaveRequest,
  getAvailableSiteModules,
  getEditorInteractionState,
  isModuleDirty,
  isJsonEditorDirty,
  normalizeSiteAdminSnapshot,
  parseJsonEditorValue,
  retainConflictAfterRefreshFailure,
} from "./model.ts";

test("legacy admin routes permanently redirect to console site", () => {
  assert.deepEqual(adminRedirects, [
    { source: "/admin", destination: "/console/site", permanent: true },
    { source: "/admin/dashboard", destination: "/console/site", permanent: true }
  ]);
});

test("snapshot normalization supports versioned pages and structured collections", () => {
  const modules = normalizeSiteAdminSnapshot({
    pages: { home: { content: { hero: { title: { zh: "主页", en: "Home" } } }, updatedAt: "r1" } },
  });

  assert.equal(modules.find((item) => item.key === "home")?.revision, "r1");
  assert.equal(modules.find((item) => item.key === "directions-page")?.endpoint, "/pages/directions_page");
  assert.equal(modules.some((item) => item.key === "team-members"), false);
});

test("save requests carry the loaded revision for optimistic concurrency", () => {
  assert.deepEqual(createSaveRequest({ key: "home", kind: "page", pageKey: "home", endpoint: "/pages/home", label: "首页", value: { hero: {} }, revision: "r1" }), {
    endpoint: "/pages/home",
    body: { content: { hero: {} }, expectedUpdatedAt: "r1" }
  });
});

test("module availability follows the permissions exposed by console bootstrap", () => {
  const modules = normalizeSiteAdminSnapshot({});

  assert.deepEqual(getAvailableSiteModules(modules, ["site.members.write"]), []);
  assert.equal(getAvailableSiteModules(modules, ["site.content.write"]).some((module) => module.key === "team-members"), false);
});

test("dirty and successful-save helpers compare values and advance revisions", () => {
  const loaded = normalizeSiteAdminSnapshot({ pages: { home: { content: { title: "Old" }, updatedAt: "4" } } })
    .find((module) => module.key === "home")!;
  const draft = { ...loaded, value: { title: "New" } };

  assert.equal(isModuleDirty(loaded, draft.value), true);
  const saved = applySavedModule(draft, "5");
  assert.equal(saved.revision, "5");
  assert.equal(isModuleDirty(saved, draft.value), false);
});

test("reloading after a conflict adopts the latest module and keeps the snapshot coherent", () => {
  const latest = normalizeSiteAdminSnapshot({
    pages: {
      home: { content: { title: "Server" }, updatedAt: "r2" },
      site: { content: { name: "Latest site" }, updatedAt: "s2" },
    },
  });

  const resolved = applyConflictSnapshot(latest, {
    moduleKey: "home",
    draftValue: { title: "Local" },
    baselineValue: { title: "Old server" },
    previousRevision: "r1",
  }, "reload");

  assert.deepEqual(resolved.draftValue, { title: "Server" });
  assert.equal(resolved.module.revision, "r2");
  assert.equal(isModuleDirty(resolved.module, resolved.draftValue), false);
  assert.equal(resolved.serverValueChanged, true);
  assert.equal(resolved.modules.find((module) => module.key === "site")?.revision, "s2");
});

test("keeping local changes rebases the captured draft onto the latest revision", () => {
  const latest = normalizeSiteAdminSnapshot({
    pages: { home: { content: { title: "Server" }, updatedAt: "r2" } },
  });

  const resolved = applyConflictSnapshot(latest, {
    moduleKey: "home",
    draftValue: { title: "Local" },
    baselineValue: { title: "Old server" },
    previousRevision: "r1",
  }, "keep-local");

  assert.deepEqual(resolved.draftValue, { title: "Local" });
  assert.equal(resolved.module.revision, "r2");
  assert.equal(isModuleDirty(resolved.module, resolved.draftValue), true);
  assert.deepEqual(createSaveRequest({ ...resolved.module, value: resolved.draftValue }).body, {
    content: { title: "Local" },
    expectedUpdatedAt: "r2",
  });
});

test("failed conflict refresh retains the captured draft and conflict revision", () => {
  const conflict = {
    moduleKey: "home",
    draftValue: { title: "Local" },
    baselineValue: { title: "Old server" },
    previousRevision: "r1",
  };

  assert.deepEqual(retainConflictAfterRefreshFailure(conflict, "Refresh failed"), {
    conflict,
    error: "Refresh failed",
  });
});

test("JSON editor parsing reports invalid input without replacing the current value", () => {
  assert.deepEqual(parseJsonEditorValue('{"title":{"zh":"主页","en":"Home"}}'), {
    ok: true,
    value: { title: { zh: "主页", en: "Home" } },
  });
  assert.equal(parseJsonEditorValue("{").ok, false);
});

test("invalid JSON remains dirty when its source differs from the baseline serialization", () => {
  const baseline = { title: "Old" };

  assert.equal(isJsonEditorDirty(baseline, JSON.stringify(baseline, null, 2)), false);
  assert.equal(isJsonEditorDirty(baseline, "{"), true);
});

test("conflict refresh disables editor interactions until success or failure completes", () => {
  assert.deepEqual(getEditorInteractionState(true), { busy: true, disabled: true });
  assert.deepEqual(getEditorInteractionState(false), { busy: false, disabled: false });
});
