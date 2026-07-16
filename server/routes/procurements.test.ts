import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express, { type RequestHandler } from "express";
import type { AuthenticatedUser } from "../middleware/auth.js";
import { createProcurementRouter } from "./procurements.js";

const identity = (permissions: string[]): AuthenticatedUser => ({ id: "00000000-0000-4000-8000-000000000001", username: "alice", displayName: "Alice", baseTier: "normal", permissions });
const auth = (user?: AuthenticatedUser): RequestHandler => (request, _response, next) => { request.authUser = user; next(); };

async function request(method: string, path: string, options: { user?: AuthenticatedUser; body?: unknown; origin?: boolean } = {}) {
  const calls: string[] = [];
  const service = new Proxy({ listRequests: async () => [], getRequest: async () => ({ id: "request-1" }) }, { get(target, property) { if (property in target) return target[property as keyof typeof target]; return async () => { calls.push(String(property)); return { id: "request-1" }; }; } });
  const app = express(); app.use(express.json()); app.use(createProcurementRouter({ authMiddleware: auth(options.user), service: service as never, trustProxy: false }));
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); listener.once("error", reject); });
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const response = await fetch(`${base}${path}`, { method, headers: { ...(options.origin ? { origin: base } : {}), ...(options.body === undefined ? {} : { "content-type": "application/json" }) }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
    return { status: response.status, body: await response.json(), calls };
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test("normal members can list their own requests and create one", async () => {
  assert.equal((await request("GET", "/api/procurements?scope=mine", { user: identity(["procurements.read_own"]) })).status, 200);
  const created = await request("POST", "/api/procurements", { user: identity(["procurements.create"]), origin: true, body: { title: "相机", reason: "实验", items: [{ itemName: "D455", quantity: 1 }] } });
  assert.equal(created.status, 200);
  assert.deepEqual(created.calls, ["createRequest"]);
});

test("members can browse the catalog while catalog changes require purchase permission", async () => {
  const listed = await request("GET", "/api/procurements/catalog?search=M6", { user: identity(["procurements.create"]) });
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.calls, ["listCatalog"]);
  const denied = await request("POST", "/api/procurements/catalog/categories", { user: identity(["procurements.create"]), origin: true, body: { code: "bolts", nameZh: "螺栓" } });
  assert.equal(denied.status, 403);
  const allowed = await request("POST", "/api/procurements/catalog/categories", { user: identity(["procurements.purchase"]), origin: true, body: { code: "bolts", nameZh: "螺栓" } });
  assert.equal(allowed.status, 200);
  assert.deepEqual(allowed.calls, ["createCatalogCategory"]);
});

test("all-scope and approval actions require their advanced permissions", async () => {
  assert.equal((await request("GET", "/api/procurements?scope=all", { user: identity(["procurements.read_own"]) })).status, 403);
  assert.equal((await request("POST", "/api/procurements/00000000-0000-4000-8000-000000000099/transition", { user: identity(["procurements.read_own"]), origin: true, body: { action: "approve" } })).status, 403);
  assert.equal((await request("POST", "/api/procurements/00000000-0000-4000-8000-000000000099/transition", { user: identity(["procurements.review"]), origin: true, body: { action: "approve" } })).status, 200);
});

test("procurement mutations require same origin", async () => {
  const response = await request("POST", "/api/procurements", { user: identity(["procurements.create"]), body: { title: "相机", reason: "实验", items: [{ itemName: "D455", quantity: 1 }] } });
  assert.equal(response.status, 403);
  assert.deepEqual(response.calls, []);
});
