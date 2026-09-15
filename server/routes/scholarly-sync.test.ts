import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express, { type RequestHandler } from "express";
import type { AuthenticatedUser } from "../middleware/auth.js";
import { createScholarlySyncRouter } from "./scholarly-sync.js";
import { ProviderHttpError } from "../services/scholarly-sync/providers/http.js";

function auth(user?: AuthenticatedUser): RequestHandler {
  return (request, _response, next) => { request.authUser = user; next(); };
}

const memberId = "00000000-0000-4000-8000-000000000002";
const workId = "00000000-0000-4000-8000-000000000003";
const user = (permissions: string[]): AuthenticatedUser => ({ id: "00000000-0000-4000-8000-000000000001", username: "alice", displayName: "Alice", baseTier: "normal", permissions });

async function request(method: string, path: string, options: { user?: AuthenticatedUser; body?: unknown; origin?: string; error?: unknown } = {}) {
  const calls: string[] = [];
  const invoke = async (name: string, value: unknown = {}) => { calls.push(name); if (options.error) throw options.error; return value; };
  const service = {
    getProfile: async () => invoke("getProfile", { userId: memberId }),
    updateProfile: async () => invoke("updateProfile", { userId: memberId }),
    resolveAuthor: async () => invoke("resolveAuthor", []), verifyAuthor: async () => invoke("verifyAuthor", {}),
    syncMember: async () => invoke("syncMember", {}), listCandidates: async () => invoke("listCandidates", []),
    acceptWork: async () => invoke("acceptWork", {}), mergeWork: async () => invoke("mergeWork", {}),
    ignoreWork: async () => invoke("ignoreWork", {}), restoreWork: async () => invoke("restoreWork", {}),
    getResearchItemSyncInfo: async () => invoke("getResearchItemSyncInfo", {}),
    resolveResearchItemSource: async () => invoke("resolveResearchItemSource", {}),
    setManagedFields: async () => invoke("setManagedFields", {}), status: async () => invoke("status", {}),
    syncAll: async () => invoke("syncAll", {}), listRuns: async () => invoke("listRuns", []),
    planBulk: async () => invoke("planBulk", {}), bulkAccept: async () => invoke("bulkAccept", {}),
    bulkIgnore: async () => invoke("bulkIgnore", {}), bulkMerge: async () => invoke("bulkMerge", {}),
    checkOpenAlexStatus: async () => invoke("checkOpenAlexStatus", {}),
  };
  const app = express(); app.use(express.json());
  app.use(createScholarlySyncRouter({ authMiddleware: auth(options.user), service: service as never, trustProxy: false }));
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); listener.once("error", reject);
  });
  try {
    const { port } = server.address() as AddressInfo; const base = `http://127.0.0.1:${port}`;
    const response = await fetch(`${base}${path}`, { method, headers: { ...(options.origin ? { origin: options.origin === "same" ? base : options.origin } : {}), ...(options.body === undefined ? {} : { "content-type": "application/json" }) }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
    return { status: response.status, body: await response.json().catch(() => undefined), calls };
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test("scholarly member profiles require member administration permission", async () => {
  assert.equal((await request("GET", `/api/scholarly-sync/members/${memberId}`)).status, 401);
  assert.equal((await request("GET", `/api/scholarly-sync/members/${memberId}`, { user: user(["site.content.write"]) })).status, 403);
  assert.equal((await request("GET", `/api/scholarly-sync/members/${memberId}`, { user: user(["site.members.write"]) })).status, 200);
});

test("scholarly mutations require their domain permission and same origin", async () => {
  assert.equal((await request("POST", `/api/scholarly-sync/works/${workId}/accept`, { user: user(["site.members.write"]), origin: "same" })).status, 403);
  assert.equal((await request("POST", `/api/scholarly-sync/works/${workId}/accept`, { user: user(["site.content.write"]) })).status, 403);
  assert.equal((await request("POST", `/api/scholarly-sync/works/${workId}/accept`, { user: user(["site.content.write"]), origin: "https://evil.example" })).status, 403);
  const accepted = await request("POST", `/api/scholarly-sync/works/${workId}/accept`, { user: user(["site.content.write"]), origin: "same" });
  assert.equal(accepted.status, 200); assert.deepEqual(accepted.calls, ["acceptWork"]);
});

test("scholarly routes reject malformed identifiers and managed fields before service calls", async () => {
  const invalidId = await request("POST", "/api/scholarly-sync/works/not-a-uuid/accept", { user: user(["site.content.write"]), origin: "same" });
  assert.equal(invalidId.status, 400); assert.deepEqual(invalidId.calls, []);
  const invalidField = await request("PATCH", "/api/scholarly-sync/research-items/paper-1/managed-fields", { user: user(["site.content.write"]), origin: "same", body: { managedFields: ["abstract"] } });
  assert.equal(invalidField.status, 400); assert.deepEqual(invalidField.calls, []);
});

test("duplicate external identities return a safe conflict response", async () => {
  const error = Object.assign(new Error("database detail must not leak"), { code: "23505" });
  const response = await request("PATCH", `/api/scholarly-sync/members/${memberId}`, { user: user(["site.members.write"]), origin: "same", body: {}, error });
  assert.equal(response.status, 409);
  assert.deepEqual(response.body, { error: "ORCID、OpenAlex ID 或 DOI 已被其他记录使用", code: "EXTERNAL_ID_CONFLICT" });
});

test("bulk routes reject more than 500 works before service calls", async () => {
  const ids = Array.from({ length: 501 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
  const response = await request("POST", "/api/scholarly-sync/bulk/plan", { user: user(["site.content.write"]), origin: "same", body: { workIds: ids } });
  assert.equal(response.status, 400); assert.deepEqual(response.calls, []);
});

test("provider diagnostics expose a classified retry response", async () => {
  const error = new ProviderHttpError("OpenAlex", 429, "OpenAlex 今日额度已用尽", "OPENALEX_BUDGET_EXHAUSTED", { limit: 10000, remaining: 0, creditsUsed: 1, resetSeconds: 60, resetAt: "2026-09-15T05:00:00.000Z" });
  const response = await request("POST", "/api/scholarly-sync/providers/openalex/check", { user: user(["site.content.write"]), origin: "same", error });
  assert.equal(response.status, 429); assert.equal((response.body as { code: string }).code, "OPENALEX_BUDGET_EXHAUSTED");
});
