import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { createMonitorService, DeviceAuthenticationError, type MonitorDeviceInput } from "./monitorService.js";

type Call = { sql: string; values?: readonly unknown[] };
type Result = { rowCount: number; rows: Record<string, unknown>[] };

class FakeClient {
  calls: Call[] = [];
  released = false;
  constructor(private readonly respond: (call: Call) => Result) {}
  async query(sql: string, values?: readonly unknown[]) { const call = { sql, values }; this.calls.push(call); return this.respond(call); }
  release() { this.released = true; }
}

function defaultResponse({ sql }: Call): Result {
  if (sql.includes("FROM dashboard_settings")) return { rowCount: 1, rows: [{ id: "settings-1", default_center_lng: 114.3, default_center_lat: 30.5, default_zoom: "13.2", map_provider: "maplibre", theme: "nightwatch", refresh_hint_seconds: 5, updated_at: new Date("2026-01-01") }] };
  if (sql.includes("FROM device_categories")) return { rowCount: 1, rows: [{ id: "cat-1", code: "robot", name_zh: "机器人", name_en: "Robots", icon: "bot", color: "#22c55e" }] };
  if (sql.includes("FROM devices d")) return { rowCount: 1, rows: [{ id: "device-1", code: "DOG-1", category_id: "cat-1", category_code: "robot", category_name_zh: "机器人", category_name_en: "Robots", category_icon: "bot", category_color: "#22c55e", name_zh: "机器狗", name_en: "Robot dog", model: "X", serial_number: "SN-SECRET", protocol_type: "http", auth_token_hash: "hidden", is_enabled: true, is_public: true, sort_order: 1, description_zh: "", description_en: "", metadata: { internalIp: "10.0.0.1" }, is_online: true, last_seen_at: new Date("2026-01-01"), last_heartbeat_at: new Date("2026-01-01"), mode: "patrol", mission_status: "running", battery_pct: "88", signal_pct: "76", speed_mps: "1.2", heading_deg: "90", altitude_m: "0", display_coord_system: "wgs84", display_lng: 114.3, display_lat: 30.5, state_payload: { privateDiagnostic: true }, state_updated_at: new Date("2026-01-01") }] };
  if (sql.includes("COUNT(*)::int")) return { rowCount: 1, rows: [{ online_device_count: 1, total_device_count: 1, alert_count: 0, last_updated_at: new Date("2026-01-01") }] };
  if (sql.includes("FROM monitor_service_status")) return { rowCount: 1, rows: [{ service_key: "backend", service_name: "Backend", is_online: true, status_text: "Last telemetry from PRIVATE-1", last_check_at: new Date("2026-01-01"), detail: {} }] };
  if (sql.includes("FROM device_alerts")) return { rowCount: 0, rows: [] };
  if (sql.includes("FROM device_events")) return { rowCount: 0, rows: [] };
  return { rowCount: 1, rows: [] };
}

function poolWith(respond: (call: Call) => Result = defaultResponse) {
  const client = new FakeClient(respond);
  return { client, pool: { query: (sql: string, values?: readonly unknown[]) => client.query(sql, values), connect: async () => client } };
}

const device: MonitorDeviceInput = { code: "DOG-1", categoryCode: null, name: { zh: "机器狗", en: "Robot dog" }, model: "X", serialNumber: "SN", protocolType: "http", isEnabled: true, isPublic: true, sortOrder: 0, description: { zh: "", en: "" }, metadata: {}, token: "a".repeat(32) };

test("public bootstrap exposes operational state without private device fields", async () => {
  const { pool } = poolWith();
  const snapshot = await createMonitorService(pool as never, { deviceTokenPepper: "pepper" }).getPublicBootstrap() as { devices: Record<string, unknown>[]; categories: Record<string, unknown>[]; settings: Record<string, unknown>; services: Record<string, unknown>[] };
  assert.equal(snapshot.devices.length, 1);
  assert.equal(snapshot.devices[0].code, "DOG-1");
  assert.equal("id" in snapshot.devices[0], false);
  assert.equal("serialNumber" in snapshot.devices[0], false);
  assert.equal("metadata" in snapshot.devices[0], false);
  assert.equal("id" in snapshot.categories[0], false);
  assert.equal("id" in snapshot.settings, false);
  assert.equal("detail" in snapshot.services[0], false);
  assert.equal(JSON.stringify(snapshot).includes("PRIVATE-1"), false);
  assert.equal(JSON.stringify(snapshot).includes("cat-1"), false);
  assert.equal(JSON.stringify(snapshot).includes("settings-1"), false);
  assert.equal(JSON.stringify(snapshot).includes("privateDiagnostic"), false);
  assert.equal(JSON.stringify(snapshot).includes("auth_token_hash"), false);
});

test("console bootstrap retains internal device identity and metadata but never token hashes", async () => {
  const { pool } = poolWith();
  const snapshot = await createMonitorService(pool as never, { deviceTokenPepper: "pepper" }).getConsoleBootstrap() as { devices: Record<string, unknown>[] };
  assert.equal(snapshot.devices[0].id, "device-1");
  assert.deepEqual(snapshot.devices[0].metadata, { internalIp: "10.0.0.1" });
  assert.equal(JSON.stringify(snapshot).includes("auth_token_hash"), false);
  assert.equal(JSON.stringify(snapshot).includes("hidden"), false);
});

test("device creation stores a peppered token hash and audits in one transaction", async () => {
  const { client, pool } = poolWith((call) => {
    if (call.sql.includes("SELECT id FROM device_categories")) return { rowCount: 0, rows: [] };
    if (call.sql.includes("INSERT INTO devices")) return { rowCount: 1, rows: [{ id: "device-1" }] };
    return defaultResponse(call);
  });
  const result = await createMonitorService(pool as never, { deviceTokenPepper: "pepper" }).createDevice(device, "user-1") as { deviceId: string };
  const insert = client.calls.find((call) => call.sql.includes("INSERT INTO devices"));
  assert.equal(insert?.values?.[7], createHash("sha256").update(`pepper:${device.token}`).digest("hex"));
  assert.equal(result.deviceId, "device-1");
  assert.equal(client.calls[0].sql, "BEGIN");
  assert.ok(client.calls.some((call) => call.sql.includes("INSERT INTO audit_logs")));
  assert.equal(client.calls.at(-1)?.sql, "COMMIT");
});

test("telemetry rejects invalid device credentials before opening a transaction", async () => {
  const { client, pool } = poolWith((call) => call.sql.includes("SELECT id, code, auth_token_hash") ? { rowCount: 0, rows: [] } : defaultResponse(call));
  await assert.rejects(createMonitorService(pool as never, { deviceTokenPepper: "pepper" }).ingestTelemetry({ deviceCode: "DOG-1", reportedAt: "2026-01-01T00:00:00.000Z", taskState: {}, systemState: {}, geoState: { lng: 114.3, lat: 30.5 } }, "wrong"), DeviceAuthenticationError);
  assert.equal(client.calls.some((call) => call.sql === "BEGIN"), false);
});

test("telemetry commits current state and history before broadcasting", async () => {
  const broadcasts: Array<{ type: string; payload: unknown; audience?: string }> = [];
  const expectedHash = createHash("sha256").update("pepper:device-secret").digest("hex");
  const { client, pool } = poolWith((call) => {
    if (call.sql.includes("SELECT id, code, auth_token_hash")) return { rowCount: 1, rows: [{ id: "device-1", code: "DOG-1", auth_token_hash: expectedHash }] };
    if (call.sql.includes("SELECT") && call.sql.includes("FROM devices d")) return defaultResponse(call);
    return defaultResponse(call);
  });
  await createMonitorService(pool as never, { deviceTokenPepper: "pepper", broadcast: (type, payload, audience) => broadcasts.push({ type, payload, audience }) }).ingestTelemetry({ deviceCode: "DOG-1", reportedAt: "2026-01-01T00:00:00.000Z", taskState: { mode: "patrol" }, systemState: { batteryPct: 88 }, geoState: { coordSystem: "wgs84", lng: 114.3, lat: 30.5, speedMps: 1.2 } }, "device-secret");
  assert.ok(client.calls.some((call) => call.sql.includes("INSERT INTO device_telemetry")));
  const telemetryInsert = client.calls.find((call) => call.sql.includes("INSERT INTO device_telemetry"));
  assert.match(telemetryInsert?.sql ?? "", /\$10, \$11, \$12, \$13, \$14, \$15, \$16::jsonb/);
  assert.ok(client.calls.some((call) => call.sql.includes("INSERT INTO device_current_state")));
  assert.equal(client.calls.findIndex((call) => call.sql === "COMMIT") < client.calls.length, true);
  assert.equal(broadcasts[0]?.type, "device.current-state.updated");
  const publicState = broadcasts.find((item) => item.type === "device.current-state.updated" && item.audience === "public")?.payload;
  assert.equal(JSON.stringify(publicState).includes("device-1"), false);
  assert.equal(JSON.stringify(publicState).includes("SN-SECRET"), false);
  assert.equal(JSON.stringify(publicState).includes("internalIp"), false);
});

test("post-commit broadcast failures do not turn successful telemetry into a retryable failure", async () => {
  const expectedHash = createHash("sha256").update("pepper:device-secret").digest("hex");
  const { client, pool } = poolWith((call) => call.sql.includes("SELECT id, code, auth_token_hash")
    ? { rowCount: 1, rows: [{ id: "device-1", code: "DOG-1", auth_token_hash: expectedHash }] }
    : defaultResponse(call));
  await createMonitorService(pool as never, {
    deviceTokenPepper: "pepper",
    broadcast: () => { throw new Error("socket failed"); },
  }).ingestTelemetry({ deviceCode: "DOG-1", reportedAt: "2026-01-01T00:00:00.000Z" }, "device-secret");
  assert.ok(client.calls.some((call) => call.sql === "COMMIT"));
});

test("public event broadcasts strip internal identity and device payloads", async () => {
  const expectedHash = createHash("sha256").update("pepper:device-secret").digest("hex");
  const broadcasts: Array<{ type: string; payload: unknown; audience: string }> = [];
  const { pool } = poolWith((call) => {
    if (call.sql.includes("SELECT id, code, auth_token_hash")) return { rowCount: 1, rows: [{ id: "device-1", code: "DOG-1", auth_token_hash: expectedHash }] };
    if (call.sql.includes("INSERT INTO device_events")) return { rowCount: 1, rows: [{ id: "event-1", device_id: "device-1", level: "warning", event_type: "motor.warning", title: "Motor warning", description: null, payload: { privateDiagnostic: true }, occurred_at: new Date("2026-01-01") }] };
    return defaultResponse(call);
  });
  await createMonitorService(pool as never, { deviceTokenPepper: "pepper", broadcast: (type, payload, audience) => broadcasts.push({ type, payload, audience }) })
    .ingestEvent({ deviceCode: "DOG-1", occurredAt: "2026-01-01T00:00:00.000Z", level: "warning", eventType: "motor.warning", title: "Motor warning", payload: { privateDiagnostic: true } }, "device-secret");
  const publicEvent = broadcasts.find((item) => item.type === "device.event.received" && item.audience === "public");
  assert.equal(JSON.stringify(publicEvent).includes("device-1"), false);
  assert.equal(JSON.stringify(publicEvent).includes("event-1"), false);
  assert.equal(JSON.stringify(publicEvent).includes("privateDiagnostic"), false);
});

test("offline sweep commits state and event changes before audience-scoped broadcasts", async () => {
  const broadcasts: Array<{ type: string; payload: unknown; audience?: string }> = [];
  const { client, pool } = poolWith((call) => {
    if (call.sql.includes("FOR UPDATE") && call.sql.includes("device_current_state")) {
      return { rowCount: 1, rows: [{ device_id: "device-1", code: "DOG-1", is_public: true }] };
    }
    if (call.sql.includes("INSERT INTO device_events")) {
      return { rowCount: 1, rows: [{ id: "event-1", device_id: "device-1", level: "warning", event_type: "device.offline", title: "DOG-1 is offline", description: "Heartbeat timeout", payload: {}, occurred_at: new Date("2026-01-01"), created_at: new Date("2026-01-01") }] };
    }
    return defaultResponse(call);
  });
  const service = createMonitorService(pool as never, {
    deviceTokenPepper: "pepper",
    broadcast: (type, payload, audience) => broadcasts.push({ type, payload, audience }),
  });
  await service.markOfflineDevices(30);
  assert.ok(client.calls.some((call) => call.sql.includes("UPDATE device_current_state")));
  assert.equal(client.calls.findIndex((call) => call.sql === "COMMIT") < client.calls.length, true);
  assert.deepEqual(broadcasts.map(({ type, audience }) => [type, audience]), [
    ["device.offline", "console"],
    ["device.current-state.updated", "console"],
    ["device.event.received", "console"],
    ["device.offline", "public"],
    ["device.current-state.updated", "public"],
    ["device.event.received", "public"],
  ]);
  const publicPayloads = broadcasts.filter((item) => item.audience === "public");
  assert.equal(JSON.stringify(publicPayloads).includes("device-1"), false);
  assert.equal(JSON.stringify(publicPayloads).includes("event-1"), false);
});

test("offline sweep never publishes a device that is disabled or no longer public", async () => {
  const broadcasts: Array<{ audience: string }> = [];
  const { pool } = poolWith((call) => {
    if (call.sql.includes("FOR UPDATE")) return { rowCount: 1, rows: [{ device_id: "device-1", code: "DOG-1" }] };
    if (call.sql.includes("INSERT INTO device_events")) return { rowCount: 1, rows: [{ id: "event-1", device_id: "device-1", level: "warning", event_type: "device.offline", title: "Offline", payload: {}, occurred_at: new Date("2026-01-01") }] };
    if (call.sql.includes("FROM devices d")) return { rowCount: 1, rows: [{ ...defaultResponse({ sql: "FROM devices d" }).rows[0], is_enabled: false, is_public: false }] };
    return defaultResponse(call);
  });
  await createMonitorService(pool as never, { deviceTokenPepper: "pepper", broadcast: (_type, _payload, audience) => broadcasts.push({ audience }) }).markOfflineDevices(30);
  assert.equal(broadcasts.some((item) => item.audience === "public"), false);
});
