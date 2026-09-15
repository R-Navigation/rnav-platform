import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express, { type RequestHandler } from "express";
import type { AuthenticatedUser } from "../middleware/auth.js";
import { createSettingsRouter } from "./settings.js";

const actor: AuthenticatedUser = { id: "00000000-0000-4000-8000-000000000001", username: "admin", displayName: "Admin", baseTier: "normal", permissions: ["system.settings.write"] };
function auth(user?: AuthenticatedUser): RequestHandler { return (request, _response, next) => { request.authUser = user; next(); }; }

async function invoke(method: string, path: string, options: { user?: AuthenticatedUser; origin?: "same" | "cross"; body?: unknown } = {}) {
  const calls: string[] = [];
  const overview = { settings: { enabled: true, crossrefContactEmail: "sync@example.org", version: 2, updatedAt: null, source: "database", openAlexApiKey: { configured: true, masked: "••••••••1234", version: 1 } }, members: [], lastScheduledRun: null };
  const scholarlySettings = {
    getOverview: async () => { calls.push("getOverview"); return overview; },
    updateGlobal: async () => { calls.push("updateGlobal"); return { keyChanged: true }; },
    updateMember: async () => { calls.push("updateMember"); return {}; },
    bulkMembers: async () => { calls.push("bulkMembers"); return {}; },
  };
  const scholarlySync = {
    status: async () => { calls.push("status"); return { providers: { openAlex: {}, crossref: {} } }; },
    resetOpenAlexStatus: async () => { calls.push("resetOpenAlexStatus"); },
    checkOpenAlexStatus: async () => { calls.push("checkOpenAlexStatus"); return {}; },
  };
  const app = express(); app.use(express.json());
  app.use(createSettingsRouter({ authMiddleware: auth(options.user), service: { getAll: async () => [], update: async () => ({}) } as never, scholarlySettings: scholarlySettings as never, scholarlySync: scholarlySync as never, trustProxy: false }));
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); listener.once("error", reject); });
  try {
    const { port } = server.address() as AddressInfo; const base = `http://127.0.0.1:${port}`;
    const response = await fetch(`${base}${path}`, { method, headers: { ...(options.origin ? { origin: options.origin === "same" ? base : "https://evil.example" } : {}), ...(options.body === undefined ? {} : { "content-type": "application/json" }) }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
    return { status: response.status, body: await response.json().catch(() => undefined), calls };
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test("scholarly settings require the system settings permission", async () => {
  assert.equal((await invoke("GET", "/api/settings/scholarly-sync")).status, 401);
  assert.equal((await invoke("GET", "/api/settings/scholarly-sync", { user: { ...actor, permissions: [] } })).status, 403);
  assert.equal((await invoke("GET", "/api/settings/scholarly-sync", { user: actor })).status, 200);
});

test("scholarly settings never return the complete OpenAlex key", async () => {
  const response = await invoke("GET", "/api/settings/scholarly-sync", { user: actor });
  assert.equal(response.status, 200); assert.doesNotMatch(JSON.stringify(response.body), /complete-secret/);
  assert.equal((response.body as any).settings.openAlexApiKey.masked, "••••••••1234");
});

test("global and bulk scholarly mutations require same origin and validate allowed operations", async () => {
  const global = { enabled: true, crossrefContactEmail: "sync@example.org", version: 2, openAlexApiKey: "new-key-123" };
  assert.equal((await invoke("PUT", "/api/settings/scholarly-sync", { user: actor, body: global })).status, 403);
  const saved = await invoke("PUT", "/api/settings/scholarly-sync", { user: actor, origin: "same", body: global });
  assert.equal(saved.status, 200); assert.deepEqual(saved.calls, ["updateGlobal", "resetOpenAlexStatus", "getOverview", "status"]);
  const rejected = await invoke("POST", "/api/settings/scholarly-sync/members/bulk", { user: actor, origin: "same", body: { operation: "auto_all" } });
  assert.equal(rejected.status, 400); assert.deepEqual(rejected.calls, []);
});
