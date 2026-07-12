import assert from "node:assert/strict";
import test from "node:test";
import {
  adminRedirects,
  applySavedModule,
  createSaveRequest,
  getAvailableSiteModules,
  isModuleDirty,
  normalizeSiteAdminSnapshot,
  parseJsonEditorValue,
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
    teamMembers: { items: [{ slug: "advisor-alice", group: "advisor", name: { zh: "艾丽丝", en: "Alice" } }], updatedAt: "r2" }
  });

  assert.equal(modules.find((item) => item.key === "home")?.revision, "r1");
  assert.equal(modules.find((item) => item.key === "team-members")?.revision, "r2");
});

test("save requests carry the loaded revision for optimistic concurrency", () => {
  assert.deepEqual(createSaveRequest({ key: "home", kind: "page", pageKey: "home", endpoint: "/pages/home", label: "首页", value: { hero: {} }, revision: "r1" }), {
    endpoint: "/pages/home",
    body: { content: { hero: {} }, expectedUpdatedAt: "r1" }
  });
});

test("module availability follows the permissions exposed by console bootstrap", () => {
  const modules = normalizeSiteAdminSnapshot({});

  assert.deepEqual(
    getAvailableSiteModules(modules, ["site.members.write"]).map((module) => module.key),
    ["team-members"],
  );
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

test("JSON editor parsing reports invalid input without replacing the current value", () => {
  assert.deepEqual(parseJsonEditorValue('{"title":{"zh":"主页","en":"Home"}}'), {
    ok: true,
    value: { title: { zh: "主页", en: "Home" } },
  });
  assert.equal(parseJsonEditorValue("{").ok, false);
});
