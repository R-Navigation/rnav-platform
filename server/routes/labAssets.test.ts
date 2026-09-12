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
      deviceTypeCode: "camera",
      expectedRevision: "0",
      model: "D455",
      name: { en: "Camera", zh: "相机" },
      status: "idle",
      vendorSerial: "",
      assignedUserId: null,
      borrowerName: "",
      borrowerContact: "",
      storageLocation: null,
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
    deviceTypeCode: "camera", expectedRevision: "0", model: "D455",
    name: { en: "Camera", zh: "相机" }, status: "idle", vendorSerial: "",
    assignedUserId: null, borrowerName: "", borrowerContact: "",
    storageLocation: null,
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

test("batch asset updates require write permission and use one service operation", async () => {
  const denied = await request("POST", "/api/lab-assets/assets/batch", {
    user: user(["lab_assets.read"]), origin: "same-origin",
    body: { assetCodes: ["CAM-1"], action: "set_location", value: "507", expectedRevision: "0" },
  });
  assert.equal(denied.statusCode, 403);
  const updated = await request("POST", "/api/lab-assets/assets/batch", {
    user: user(["lab_assets.write"]), origin: "same-origin",
    body: { assetCodes: ["CAM-1", "CAM-2"], action: "set_location", value: "507", expectedRevision: "0" },
  });
  assert.equal(updated.statusCode, 200);
  assert.deepEqual(updated.calls, ["batchAssets"]);
});

test("asset import validation and commit require write permission", async () => {
  const body = { rows: [{ code: "CAM-2", nameZh: "相机", nameEn: "", model: "D455", deviceTypeCode: "camera", vendorSerial: "SN-2", storageLocation: "507", status: "idle", platformCode: "", descriptionZh: "" }], expectedRevision: "0" };
  assert.equal((await request("POST", "/api/lab-assets/assets/import/validate", { user: user(["lab_assets.read"]), origin: "same-origin", body })).statusCode, 403);
  const validated = await request("POST", "/api/lab-assets/assets/import/validate", { user: user(["lab_assets.write"]), origin: "same-origin", body });
  assert.equal(validated.statusCode, 200); assert.deepEqual(validated.calls, ["validateAssetImport"]);
  const committed = await request("POST", "/api/lab-assets/assets/import/commit", { user: user(["lab_assets.write"]), origin: "same-origin", body });
  assert.equal(committed.statusCode, 200); assert.deepEqual(committed.calls, ["commitAssetImport"]);
});

test("dedicated platform component routes require write permission and dispatch explicit operations",async()=>{const base="/api/lab-assets/platforms/DOG-1/components";const add={assetCode:"CAM-1",role:{zh:"前视",en:"Front"},slot:"front",sortOrder:0,expectedRevision:"0"};assert.equal((await request("POST",base,{user:user(["lab_assets.read"]),origin:"same-origin",body:add})).statusCode,403);const operations=[await request("POST",base,{user:user(["lab_assets.write"]),origin:"same-origin",body:add}),await request("PATCH",`${base}/CAM-1`,{user:user(["lab_assets.write"]),origin:"same-origin",body:{role:{zh:"后视",en:"Rear"},slot:null,sortOrder:1,expectedRevision:"0"}}),await request("DELETE",`${base}/CAM-1`,{user:user(["lab_assets.write"]),origin:"same-origin",body:{storageLocation:"507-A",expectedRevision:"0"}}),await request("POST",`${base}/CAM-1/transfer`,{user:user(["lab_assets.write"]),origin:"same-origin",body:{role:{zh:"前视",en:"Front"},slot:null,sortOrder:0,expectedRevision:"0"}})];assert.deepEqual(operations.map((item)=>item.statusCode),[200,200,200,200]);assert.deepEqual(operations.flatMap((item)=>item.calls),["addPlatformComponent","updatePlatformComponent","removePlatformComponent","transferPlatformComponent"]);});

test("members can request devices while only asset managers can review", async () => {
  const submitted = await request("POST", "/api/lab-assets/usage-requests", {
    user: user(["lab_assets.read"]), origin: "same-origin",
    body: { assetCode: "CAM-1", reason: "定位实验", expectedRevision: "0" },
  });
  assert.equal(submitted.statusCode, 200);
  assert.deepEqual(submitted.calls, ["submitUsageRequest"]);

  const denied = await request("POST", "/api/lab-assets/usage-requests/00000000-0000-4000-8000-000000000099/review", {
    user: user(["lab_assets.read"]), origin: "same-origin",
    body: { action: "approve", note: "", expectedRevision: "0" },
  });
  assert.equal(denied.statusCode, 403);

  const approved = await request("POST", "/api/lab-assets/usage-requests/00000000-0000-4000-8000-000000000099/review", {
    user: user(["lab_assets.write"]), origin: "same-origin",
    body: { action: "approve", note: "同意", expectedRevision: "0" },
  });
  assert.equal(approved.statusCode, 200);
  assert.deepEqual(approved.calls, ["reviewUsageRequest"]);
});
