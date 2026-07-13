import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express, { type RequestHandler } from "express";
import type { AuthenticatedUser } from "../middleware/auth.js";
import { createMonitorRouter } from "./monitor.js";
import { DeviceAuthenticationError, MonitorNotFoundError, MonitorValidationError } from "../services/monitor/monitorService.js";

const identity = (permissions: string[]): AuthenticatedUser => ({ id: "00000000-0000-4000-8000-000000000001", username: "alice", displayName: "Alice", baseTier: "normal", permissions });
const auth = (user?: AuthenticatedUser): RequestHandler => (request, _response, next) => { request.authUser = user; next(); };

async function request(method: string, path: string, options: { user?: AuthenticatedUser; body?: unknown; origin?: string; headers?: Record<string, string> } = {}) {
  const calls: string[] = [];
  const service = new Proxy({
    getPublicBootstrap: async () => ({ devices: [], settings: {}, summary: {} }),
    getHomepageSnapshot: async () => ({ devices: [], map: {}, summary: {} }),
    getConsoleBootstrap: async () => ({ devices: [{ id: "private-device" }], alerts: [{ id: "private-alert" }], events: [{ id: "private-event" }], settings: {}, summary: {} }),
  }, { get(target, property) { if (property in target) return target[property as keyof typeof target]; return async () => { calls.push(String(property)); return { revision: "1" }; }; } });
  const app = express(); app.use(express.json());
  app.use(createMonitorRouter({ authMiddleware: auth(options.user), service: service as never, trustProxy: false }));
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); listener.once("error", reject); });
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const response = await fetch(`${base}${path}`, { method, headers: { ...(options.headers ?? {}), ...(options.origin ? { origin: options.origin === "same-origin" ? base : options.origin } : {}), ...(options.body === undefined ? {} : { "content-type": "application/json" }) }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
    return { status: response.status, body: await response.json(), calls };
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test("public monitor snapshots require no account while console details require read permission", async () => {
  assert.equal((await request("GET", "/api/monitor/public/bootstrap")).status, 200);
  assert.equal((await request("GET", "/api/monitor/public/homepage-snapshot?limit=6")).status, 200);
  assert.equal((await request("GET", "/api/monitor/console/bootstrap")).status, 401);
  assert.equal((await request("GET", "/api/monitor/console/bootstrap", { user: identity(["console.access"]) })).status, 403);
  assert.equal((await request("GET", "/api/monitor/console/bootstrap", { user: identity(["monitor.devices.read"]) })).status, 200);
  assert.equal((await request("GET", "/api/monitor/console/bootstrap", { user: identity(["monitor.devices.write"]) })).status, 200);
  assert.equal((await request("GET", "/api/monitor/console/bootstrap", { user: identity(["monitor.settings.write"]) })).status, 200);
});

test("settings-only users do not receive internal device records", async () => {
  const response = await request("GET", "/api/monitor/console/bootstrap", {
    user: identity(["monitor.settings.write"]),
  });
  assert.equal(response.status, 200);
  const body = response.body as { devices: unknown[]; alerts: unknown[]; events: unknown[] };
  assert.deepEqual(body.devices, []);
  assert.deepEqual(body.alerts, []);
  assert.deepEqual(body.events, []);
});

test("device and setting mutations use separate permissions and require same origin", async () => {
  const deviceBody = { code: "DOG-1", categoryCode: null, name: { zh: "机器狗", en: "Robot dog" }, model: "X", serialNumber: "SN", protocolType: "http", isEnabled: true, isPublic: true, sortOrder: 0, description: { zh: "", en: "" }, metadata: {}, token: "a".repeat(32) };
  assert.equal((await request("POST", "/api/monitor/console/devices", { user: identity(["monitor.devices.write"]), body: deviceBody })).status, 403);
  const created = await request("POST", "/api/monitor/console/devices", { user: identity(["monitor.devices.write"]), origin: "same-origin", body: deviceBody });
  assert.equal(created.status, 200); assert.deepEqual(created.calls, ["createDevice"]);
  const deniedSettings = await request("PUT", "/api/monitor/console/settings", { user: identity(["monitor.devices.write"]), origin: "same-origin", body: { defaultCenterLng: 114, defaultCenterLat: 30, defaultZoom: 13, mapProvider: "maplibre", theme: "nightwatch", refreshHintSeconds: 5 } });
  assert.equal(deniedSettings.status, 403);
});

test("device ingest accepts device credentials without a member session", async () => {
  const response = await request("POST", "/api/monitor/ingest/v1/telemetry", { headers: { authorization: "Bearer device-secret" }, body: { deviceCode: "DOG-1", reportedAt: new Date().toISOString(), taskState: {}, systemState: {}, geoState: { lng: 114.3, lat: 30.5 } } });
  assert.equal(response.status, 200);
  assert.deepEqual(response.calls, ["ingestTelemetry"]);
});

test("legacy monitor ingest paths remain available during device rollout", async () => {
  const reportedAt = new Date().toISOString();
  const telemetry = await request("POST", "/monitor/api/ingest/v1/telemetry", {
    headers: { authorization: "Bearer device-secret" },
    body: { deviceCode: "DOG-1", reportedAt, taskState: {}, systemState: {}, geoState: { lng: 114.3, lat: 30.5 } }
  });
  const heartbeat = await request("POST", "/monitor/api/ingest/v1/heartbeat", {
    headers: { "x-device-token": "device-secret" },
    body: { deviceCode: "DOG-1", reportedAt }
  });
  assert.equal(telemetry.status, 200);
  assert.deepEqual(telemetry.calls, ["ingestTelemetry"]);
  assert.equal(heartbeat.status, 200);
  assert.deepEqual(heartbeat.calls, ["ingestHeartbeat"]);
});

test("monitor domain errors map to stable client responses", async () => {
  const app = express(); app.use(express.json());
  const service = {
    ingestTelemetry: async () => { throw new DeviceAuthenticationError(); },
    createDevice: async () => { throw new MonitorValidationError("Token required"); },
    disableDevice: async () => { throw new MonitorNotFoundError("Device not found"); },
  };
  app.use(createMonitorRouter({ authMiddleware: auth(identity(["monitor.devices.read", "monitor.devices.write"])), service: service as never, trustProxy: false }));
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); listener.once("error", reject); });
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const telemetry = await fetch(`${base}/api/monitor/ingest/v1/telemetry`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer wrong" }, body: JSON.stringify({ deviceCode: "DOG-1", reportedAt: new Date().toISOString() }) });
    assert.equal(telemetry.status, 401);
    const deviceBody = { code: "DOG-1", categoryCode: null, name: { zh: "机器狗", en: "Robot dog" }, model: "X", serialNumber: "SN", protocolType: "http", isEnabled: true, isPublic: true, sortOrder: 0, description: { zh: "", en: "" }, metadata: {}, token: "a".repeat(32) };
    const create = await fetch(`${base}/api/monitor/console/devices`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify(deviceBody) });
    assert.equal(create.status, 400);
    const disable = await fetch(`${base}/api/monitor/console/devices/00000000-0000-4000-8000-000000000099`, { method: "DELETE", headers: { origin: base } });
    assert.equal(disable.status, 404);
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});

test("monitor maps duplicate records and malformed ids without exposing database errors", async () => {
  const duplicate = Object.assign(new Error("duplicate"), { code: "23505" });
  const service = { createDevice: async () => { throw duplicate; } };
  const app = express(); app.use(express.json());
  app.use(createMonitorRouter({ authMiddleware: auth(identity(["monitor.devices.read", "monitor.devices.write"])), service: service as never, trustProxy: false }));
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); listener.once("error", reject); });
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const deviceBody = { code: "DOG-1", categoryCode: null, name: { zh: "机器狗", en: "Robot dog" }, model: "X", serialNumber: "SN", protocolType: "http", isEnabled: true, isPublic: true, sortOrder: 0, description: { zh: "", en: "" }, metadata: {}, token: "a".repeat(32) };
    const create = await fetch(`${base}/api/monitor/console/devices`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify(deviceBody) });
    assert.equal(create.status, 409);
    const track = await fetch(`${base}/api/monitor/console/devices/not-a-uuid/track`);
    assert.equal(track.status, 400);
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});
