import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express, { type RequestHandler } from "express";
import type { AuthenticatedUser } from "../middleware/auth.js";
import { ConflictError, RevisionConflictError } from "../services/lab-assets/labAssetsService.js";
import { createLabAssetsRouter } from "./labAssets.js";

function auth(user?: AuthenticatedUser): RequestHandler {
  return (request, _response, next) => { request.authUser = user; next(); };
}

const user = (permissions: string[]): AuthenticatedUser => ({
  id: "00000000-0000-4000-8000-000000000001",
  username: "alice",
  displayName: "Alice",
  baseTier: "normal",
  permissions,
});

async function request(method: string, path: string, options: { user?: AuthenticatedUser; body?: unknown; origin?: string; mutationError?: Error } = {}) {
  const calls: string[] = [];
  const service = new Proxy({
    getSnapshot: async () => ({ assets: [], page: {}, platforms: [], platformTypes: [], revision: "0", stats: {} }),
  }, {
    get(target, property) {
      if (property in target) return target[property as keyof typeof target];
      return async () => { calls.push(String(property)); if (options.mutationError) throw options.mutationError; return "1"; };
    },
  });
  const app = express();
  app.use(express.json());
  app.use(createLabAssetsRouter({ authMiddleware: auth(options.user), service: service as never, trustProxy: false }));
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    listener.once("error", reject);
  });
  try {
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(options.origin ? { origin: options.origin === "same-origin" ? base : options.origin } : {}),
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    return { body: text ? JSON.parse(text) : undefined, calls, statusCode: response.status };
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("normal read permission cannot write", async () => {
  assert.equal((await request("GET", "/api/lab-assets", { user: user(["lab_assets.read"]) })).statusCode, 200);
  const response = await request("POST", "/api/lab-assets/assets", {
    user: user(["lab_assets.read"]),
    origin: "same-origin",
    body: { code: "CAM-1", expectedRevision: "0" },
  });
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.calls, []);
});

test("lab_assets.write permission can read and write", async () => {
  assert.equal((await request("GET", "/api/lab-assets", { user: user(["lab_assets.write"]) })).statusCode, 200);
  const response = await request("POST", "/api/lab-assets/assets", {
    user: user(["lab_assets.write"]),
    origin: "same-origin",
    body: {
      code: "CAM-1",
      currentPlatformCode: null,
      description: { en: "", zh: "" },
      deviceType: { en: "Camera", zh: "相机" },
      expectedRevision: "0",
      model: "D455",
      name: { en: "Camera", zh: "相机" },
      shareScope: "internal",
      sortOrder: 0,
      status: "idle",
      vendorSerial: "",
    },
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.calls, ["createAsset"]);
});

test("mutations require same origin", async () => {
  const response = await request("DELETE", "/api/lab-assets/assets/CAM-1", {
    user: user(["lab_assets.write"]),
    body: { expectedRevision: "0" },
  });
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.calls, []);
});

test("invalid mutation bodies return 400 before the service runs", async () => {
  const response = await request("POST", "/api/lab-assets/assets", {
    user: user(["lab_assets.write"]),
    origin: "same-origin",
    body: { code: "CAM-1", expectedRevision: "not-a-revision" },
  });
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.calls, []);
});

test("domain conflicts map to 409 responses", async () => {
  const body = {
    code: "CAM-1", currentPlatformCode: null, description: { en: "", zh: "" },
    deviceType: { en: "Camera", zh: "相机" }, expectedRevision: "0", model: "D455",
    name: { en: "Camera", zh: "相机" }, shareScope: "internal", sortOrder: 0,
    status: "idle", vendorSerial: "",
  };
  const duplicate = await request("POST", "/api/lab-assets/assets", {
    user: user(["lab_assets.write"]), origin: "same-origin", body,
    mutationError: new ConflictError("Asset code already exists"),
  });
  assert.equal(duplicate.statusCode, 409);
  assert.deepEqual(duplicate.body, { error: "Asset code already exists" });

  const revision = await request("POST", "/api/lab-assets/assets", {
    user: user(["lab_assets.write"]), origin: "same-origin", body,
    mutationError: new RevisionConflictError(),
  });
  assert.equal(revision.statusCode, 409);
  assert.deepEqual(revision.body, { error: "Lab assets revision conflict" });
});
