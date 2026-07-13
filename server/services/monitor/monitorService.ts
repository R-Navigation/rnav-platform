import { createHash, timingSafeEqual } from "node:crypto";
import type { z } from "zod";
import type {
  categoryRequestSchema,
  deviceRequestSchema,
  ingestEventSchema,
  ingestHeartbeatSchema,
  ingestTelemetrySchema,
  settingsRequestSchema,
} from "./schemas.js";

type QueryResult = { rowCount: number | null; rows: Record<string, any>[] };
type Queryable = { query(sql: string, values?: readonly unknown[]): Promise<QueryResult> };
type TransactionClient = Queryable & { release(): void };
type MonitorPool = Queryable & { connect(): Promise<TransactionClient> };
export type MonitorAudience = "public" | "console";
type Broadcast = (type: string, payload: unknown, audience: MonitorAudience) => void;

export type MonitorDeviceInput = z.output<typeof deviceRequestSchema>;
type MonitorCategoryInput = z.output<typeof categoryRequestSchema>;
type MonitorSettingsInput = z.output<typeof settingsRequestSchema>;
type TelemetryInput = z.output<typeof ingestTelemetrySchema>;
type HeartbeatInput = z.output<typeof ingestHeartbeatSchema>;
type EventInput = z.output<typeof ingestEventSchema>;

type DeviceIdentity = { id: string; code: string };
type ErrorWithCleanupFailures = Error & { cleanupFailures?: unknown[] };

export class DeviceAuthenticationError extends Error {
  constructor() {
    super("Invalid device credentials");
    this.name = "DeviceAuthenticationError";
  }
}

export class MonitorNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MonitorNotFoundError";
  }
}

export class MonitorValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MonitorValidationError";
  }
}

const deviceSelect = `
  SELECT
    d.id, d.code, d.category_id, d.name_zh, d.name_en, d.model,
    d.serial_number, d.protocol_type, d.auth_token_hash, d.is_enabled,
    d.is_public, d.sort_order, d.description_zh, d.description_en,
    d.metadata, d.created_at, d.updated_at,
    c.code AS category_code, c.name_zh AS category_name_zh,
    c.name_en AS category_name_en, c.icon AS category_icon,
    c.color AS category_color,
    s.is_online, s.last_seen_at, s.last_heartbeat_at, s.mode,
    s.mission_status, s.battery_pct, s.signal_pct, s.speed_mps,
    s.heading_deg, s.altitude_m, s.raw_coord_system, s.raw_lng,
    s.raw_lat, s.display_coord_system, s.display_lng, s.display_lat,
    s.payload AS state_payload, s.updated_at AS state_updated_at
  FROM devices d
  LEFT JOIN device_categories c ON c.id = d.category_id
  LEFT JOIN device_current_state s ON s.device_id = d.id
`;

const numberOrNull = (value: unknown) => value == null || !Number.isFinite(Number(value)) ? null : Number(value);
const objectOrEmpty = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

function categoryFromRow(row: Record<string, any>, includeId = true) {
  if (!row.category_id && !row.category_code) return null;
  return {
    ...(includeId && row.category_id ? { id: row.category_id } : {}),
    code: row.category_code,
    nameZh: row.category_name_zh,
    nameEn: row.category_name_en,
    icon: row.category_icon,
    color: row.category_color,
  };
}

function currentStateFromRow(row: Record<string, any>, includePayload = true) {
  return {
    isOnline: Boolean(row.is_online),
    lastSeenAt: row.last_seen_at ?? null,
    lastHeartbeatAt: row.last_heartbeat_at ?? null,
    taskState: { mode: row.mode ?? null, missionStatus: row.mission_status ?? null },
    systemState: { batteryPct: numberOrNull(row.battery_pct), signalPct: numberOrNull(row.signal_pct) },
    geoState: {
      coordSystem: row.display_coord_system ?? row.raw_coord_system ?? null,
      lng: numberOrNull(row.display_lng ?? row.raw_lng),
      lat: numberOrNull(row.display_lat ?? row.raw_lat),
      speedMps: numberOrNull(row.speed_mps),
      headingDeg: numberOrNull(row.heading_deg),
      altitudeM: numberOrNull(row.altitude_m),
    },
    ...(includePayload ? { payload: objectOrEmpty(row.state_payload) } : {}),
    updatedAt: row.state_updated_at ?? null,
  };
}

function mapPublicDevice(row: Record<string, any>) {
  return {
    code: row.code,
    nameZh: row.name_zh,
    nameEn: row.name_en,
    displayName: row.name_zh || row.name_en || row.code,
    model: row.model,
    descriptionZh: row.description_zh,
    descriptionEn: row.description_en,
    category: categoryFromRow(row, false),
    currentState: currentStateFromRow(row, false),
  };
}

function mapConsoleDevice(row: Record<string, any>) {
  return {
    id: row.id,
    code: row.code,
    nameZh: row.name_zh,
    nameEn: row.name_en,
    displayName: row.name_zh || row.name_en || row.code,
    model: row.model,
    serialNumber: row.serial_number,
    protocolType: row.protocol_type,
    isEnabled: Boolean(row.is_enabled),
    isPublic: Boolean(row.is_public),
    sortOrder: Number(row.sort_order ?? 0),
    descriptionZh: row.description_zh,
    descriptionEn: row.description_en,
    metadata: objectOrEmpty(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    category: categoryFromRow(row),
    currentState: currentStateFromRow(row),
  };
}

function publicDeviceFromConsole(device: Record<string, any>) {
  return mapPublicDevice({
    ...device,
    name_zh: device.nameZh,
    name_en: device.nameEn,
    description_zh: device.descriptionZh,
    description_en: device.descriptionEn,
    category_code: device.category?.code,
    category_name_zh: device.category?.nameZh,
    category_name_en: device.category?.nameEn,
    category_icon: device.category?.icon,
    category_color: device.category?.color,
    is_online: device.currentState?.isOnline,
    last_seen_at: device.currentState?.lastSeenAt,
    last_heartbeat_at: device.currentState?.lastHeartbeatAt,
    mode: device.currentState?.taskState?.mode,
    mission_status: device.currentState?.taskState?.missionStatus,
    battery_pct: device.currentState?.systemState?.batteryPct,
    signal_pct: device.currentState?.systemState?.signalPct,
    display_coord_system: device.currentState?.geoState?.coordSystem,
    display_lng: device.currentState?.geoState?.lng,
    display_lat: device.currentState?.geoState?.lat,
    speed_mps: device.currentState?.geoState?.speedMps,
    heading_deg: device.currentState?.geoState?.headingDeg,
    altitude_m: device.currentState?.geoState?.altitudeM,
    state_updated_at: device.currentState?.updatedAt,
  });
}

function mapCategory(row: Record<string, any>, publicProjection = false) {
  return {
    ...(!publicProjection ? { id: row.id } : {}),
    code: row.code,
    nameZh: row.name_zh,
    nameEn: row.name_en,
    icon: row.icon,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSettings(row: Record<string, any> | undefined, publicProjection = false) {
  if (!row) return null;
  return {
    ...(!publicProjection ? { id: row.id } : {}),
    defaultCenterLng: numberOrNull(row.default_center_lng),
    defaultCenterLat: numberOrNull(row.default_center_lat),
    defaultZoom: numberOrNull(row.default_zoom),
    mapProvider: row.map_provider,
    theme: row.theme,
    refreshHintSeconds: Number(row.refresh_hint_seconds),
    updatedAt: row.updated_at,
  };
}

function mapService(row: Record<string, any>, publicProjection = false) {
  return {
    key: row.service_key,
    name: row.service_name,
    online: Boolean(row.is_online),
    statusText: publicProjection ? (row.is_online ? "online" : "offline") : row.status_text,
    lastCheckAt: row.last_check_at,
    ...(!publicProjection ? { detail: objectOrEmpty(row.detail) } : {}),
  };
}

function mapEvent(row: Record<string, any>, publicProjection = false) {
  return {
    ...(!publicProjection ? { id: row.id, deviceId: row.device_id } : {}),
    deviceCode: row.device_code,
    deviceName: row.device_name,
    level: row.level,
    eventType: row.event_type,
    title: row.title,
    description: row.description,
    ...(!publicProjection ? { payload: objectOrEmpty(row.payload) } : {}),
    occurredAt: row.occurred_at,
  };
}

function publicEventFromConsole(event: Record<string, any>) {
  return {
    deviceCode: event.deviceCode,
    deviceName: event.deviceName,
    level: event.level,
    eventType: event.eventType,
    title: event.title,
    description: event.description,
    occurredAt: event.occurredAt,
  };
}

function mapAlert(row: Record<string, any>, publicProjection = false) {
  return {
    ...(!publicProjection ? { id: row.id, deviceId: row.device_id } : {}),
    deviceCode: row.device_code,
    deviceName: row.device_name,
    alertType: row.alert_type,
    severity: row.severity,
    title: row.title,
    description: row.description,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    ...(!publicProjection ? {
      acknowledgedBy: row.acknowledged_by,
      acknowledgedAt: row.acknowledged_at,
      payload: objectOrEmpty(row.payload),
    } : {}),
  };
}

function hashDeviceToken(token: string, pepper: string) {
  return createHash("sha256").update(`${pepper}:${token}`).digest("hex");
}

function hashesMatch(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function attachCleanupFailure(primaryError: unknown, cleanupError: unknown) {
  if (!(primaryError instanceof Error)) return;
  const error = primaryError as ErrorWithCleanupFailures;
  error.cleanupFailures ??= [];
  error.cleanupFailures.push(cleanupError);
}

async function transaction<T>(pool: MonitorPool, work: (client: TransactionClient) => Promise<T>) {
  const client = await pool.connect();
  let primaryError: unknown;
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    primaryError = error;
    try { await client.query("ROLLBACK"); } catch (rollbackError) { attachCleanupFailure(primaryError, rollbackError); }
  } finally {
    try { client.release(); } catch (releaseError) {
      if (primaryError === undefined) throw releaseError;
      attachCleanupFailure(primaryError, releaseError);
    }
  }
  throw primaryError;
}

async function audit(client: Queryable, actorId: string, action: string, targetType: string, targetId: string, detail: unknown = {}) {
  await client.query(
    `INSERT INTO audit_logs (actor_id, action, target_type, target_id, detail)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [actorId, action, targetType, targetId, JSON.stringify(detail)],
  );
}

async function resolveCategoryId(client: Queryable, categoryCode: string | null) {
  if (categoryCode === null) return null;
  const result = await client.query("SELECT id FROM device_categories WHERE code = $1 LIMIT 1", [categoryCode]);
  if (!result.rowCount) throw new MonitorValidationError("Category not found");
  return result.rows[0].id as string;
}

async function getSettings(queryable: Queryable, publicProjection = false) {
  const result = await queryable.query(
    `SELECT id, default_center_lng, default_center_lat, default_zoom, map_provider,
            theme, refresh_hint_seconds, updated_at
     FROM dashboard_settings ORDER BY updated_at DESC LIMIT 1`,
  );
  return mapSettings(result.rows[0], publicProjection);
}

async function getCategories(queryable: Queryable, publicProjection = false) {
  const result = await queryable.query("SELECT * FROM device_categories ORDER BY code");
  return result.rows.map((row) => mapCategory(row, publicProjection));
}

async function getDevices(queryable: Queryable, publicOnly: boolean) {
  const result = await queryable.query(
    `${deviceSelect}${publicOnly ? " WHERE d.is_enabled = true AND d.is_public = true" : ""}
     ORDER BY d.sort_order ASC, d.code ASC`,
  );
  return result.rows.map(publicOnly ? mapPublicDevice : mapConsoleDevice);
}

async function getServices(queryable: Queryable, publicProjection = false) {
  const result = await queryable.query("SELECT * FROM monitor_service_status ORDER BY service_key");
  return result.rows.map((row) => mapService(row, publicProjection));
}

async function getSummary(queryable: Queryable, publicOnly: boolean) {
  const result = await queryable.query(
    `SELECT
       (SELECT COUNT(*)::int FROM device_current_state s JOIN devices d ON d.id = s.device_id
        WHERE s.is_online = true${publicOnly ? " AND d.is_enabled = true AND d.is_public = true" : ""}) AS online_device_count,
       (SELECT COUNT(*)::int FROM devices d${publicOnly ? " WHERE d.is_enabled = true AND d.is_public = true" : ""}) AS total_device_count,
       (SELECT COUNT(*)::int FROM device_alerts a JOIN devices d ON d.id = a.device_id
        WHERE a.status = 'open'${publicOnly ? " AND d.is_enabled = true AND d.is_public = true" : ""}) AS alert_count,
       GREATEST(COALESCE((SELECT MAX(updated_at) FROM device_current_state), to_timestamp(0)),
                COALESCE((SELECT MAX(last_check_at) FROM monitor_service_status), to_timestamp(0))) AS last_updated_at`,
  );
  const row = result.rows[0] ?? {};
  return {
    onlineDeviceCount: Number(row.online_device_count ?? 0),
    totalDeviceCount: Number(row.total_device_count ?? 0),
    alertCount: Number(row.alert_count ?? 0),
    lastUpdatedAt: row.last_updated_at ?? null,
  };
}

async function getAlerts(queryable: Queryable, publicOnly: boolean, limit = 8) {
  const result = await queryable.query(
    `SELECT a.*, d.code AS device_code, COALESCE(d.name_zh, d.name_en, d.code) AS device_name
     FROM device_alerts a JOIN devices d ON d.id = a.device_id
     WHERE a.status = 'open'${publicOnly ? " AND d.is_enabled = true AND d.is_public = true" : ""}
     ORDER BY a.started_at DESC LIMIT $1`,
    [limit],
  );
  return result.rows.map((row) => mapAlert(row, publicOnly));
}

async function getEvents(queryable: Queryable, publicOnly: boolean, limit = 12, deviceId?: string) {
  const filters = [publicOnly ? "d.is_enabled = true AND d.is_public = true" : "true"];
  const values: unknown[] = [];
  if (deviceId) { values.push(deviceId); filters.push(`e.device_id = $${values.length}`); }
  values.push(limit);
  const result = await queryable.query(
    `SELECT e.*, d.code AS device_code, COALESCE(d.name_zh, d.name_en, d.code) AS device_name
     FROM device_events e JOIN devices d ON d.id = e.device_id
     WHERE ${filters.join(" AND ")} ORDER BY e.occurred_at DESC LIMIT $${values.length}`,
    values,
  );
  return result.rows.map((row) => mapEvent(row, publicOnly));
}

function stateValues(input: TelemetryInput | HeartbeatInput) {
  const task = input.taskState ?? {};
  const system = input.systemState ?? {};
  const geo = input.geoState ?? {};
  return {
    mode: task.mode ?? null,
    missionStatus: task.missionStatus ?? null,
    batteryPct: system.batteryPct ?? null,
    signalPct: system.signalPct ?? null,
    speedMps: geo.speedMps ?? null,
    headingDeg: geo.headingDeg ?? null,
    altitudeM: geo.altitudeM ?? null,
    coordSystem: geo.coordSystem ?? null,
    lng: geo.lng ?? null,
    lat: geo.lat ?? null,
    rawCoordSystem: geo.rawCoordSystem ?? geo.coordSystem ?? null,
    rawLng: geo.rawLng ?? geo.lng ?? null,
    rawLat: geo.rawLat ?? geo.lat ?? null,
    payload: {
      ...objectOrEmpty(input.payload),
      taskState: task,
      systemState: system,
      geoState: geo,
      ...( "heartbeatSections" in input ? { heartbeatSections: input.heartbeatSections ?? [] } : {}),
    },
  };
}

async function upsertCurrentState(client: Queryable, deviceId: string, input: TelemetryInput | HeartbeatInput, heartbeat: boolean) {
  const state = stateValues(input);
  const reportedAt = input.reportedAt ?? new Date().toISOString();
  await client.query(
    `INSERT INTO device_current_state (
       device_id, is_online, last_seen_at, last_heartbeat_at, mode, mission_status,
       battery_pct, signal_pct, speed_mps, heading_deg, altitude_m, raw_coord_system,
       raw_lng, raw_lat, display_coord_system, display_lng, display_lat, payload, updated_at
     ) VALUES ($1, true, $2, ${heartbeat ? "$2" : "NULL"}, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, now())
     ON CONFLICT (device_id) DO UPDATE SET
       is_online = true, last_seen_at = EXCLUDED.last_seen_at,
       last_heartbeat_at = ${heartbeat ? "EXCLUDED.last_heartbeat_at" : "device_current_state.last_heartbeat_at"},
       mode = COALESCE(EXCLUDED.mode, device_current_state.mode),
       mission_status = COALESCE(EXCLUDED.mission_status, device_current_state.mission_status),
       battery_pct = COALESCE(EXCLUDED.battery_pct, device_current_state.battery_pct),
       signal_pct = COALESCE(EXCLUDED.signal_pct, device_current_state.signal_pct),
       speed_mps = COALESCE(EXCLUDED.speed_mps, device_current_state.speed_mps),
       heading_deg = COALESCE(EXCLUDED.heading_deg, device_current_state.heading_deg),
       altitude_m = COALESCE(EXCLUDED.altitude_m, device_current_state.altitude_m),
       raw_coord_system = COALESCE(EXCLUDED.raw_coord_system, device_current_state.raw_coord_system),
       raw_lng = COALESCE(EXCLUDED.raw_lng, device_current_state.raw_lng),
       raw_lat = COALESCE(EXCLUDED.raw_lat, device_current_state.raw_lat),
       display_coord_system = COALESCE(EXCLUDED.display_coord_system, device_current_state.display_coord_system),
       display_lng = COALESCE(EXCLUDED.display_lng, device_current_state.display_lng),
       display_lat = COALESCE(EXCLUDED.display_lat, device_current_state.display_lat),
       payload = device_current_state.payload || EXCLUDED.payload, updated_at = now()`,
    [deviceId, reportedAt, state.mode, state.missionStatus, state.batteryPct, state.signalPct,
      state.speedMps, state.headingDeg, state.altitudeM, state.rawCoordSystem, state.rawLng, state.rawLat,
      state.coordSystem, state.lng, state.lat, JSON.stringify(state.payload)],
  );
  return reportedAt;
}

export function createMonitorService(
  pool: MonitorPool,
  options: { deviceTokenPepper: string; broadcast?: Broadcast; onRealtimeError?: (error: unknown) => void },
) {
  const broadcast = options.broadcast ?? (() => undefined);
  const onRealtimeError = options.onRealtimeError ?? (() => undefined);

  function safeBroadcast(type: string, payload: unknown, audience: MonitorAudience) {
    try { broadcast(type, payload, audience); } catch (error) { onRealtimeError(error); }
  }

  function broadcastDevice(type: string, payload: unknown, device: { isPublic?: boolean } | null) {
    safeBroadcast(type, payload, "console");
    if (!device?.isPublic) return;
    if (payload && typeof payload === "object" && "device" in payload) {
      const publicDevice = publicDeviceFromConsole(device as Record<string, any>);
      safeBroadcast(type, { ...(payload as Record<string, unknown>), device: publicDevice }, "public");
      return;
    }
    if (payload && typeof payload === "object" && "event" in payload) {
      const event = (payload as { event: Record<string, any> }).event;
      safeBroadcast(type, { event: publicEventFromConsole(event) }, "public");
      return;
    }
    safeBroadcast(type, payload, "public");
  }

  async function authenticateDevice(deviceCode: string, token: string): Promise<DeviceIdentity> {
    if (!token) throw new DeviceAuthenticationError();
    const result = await pool.query(
      "SELECT id, code, auth_token_hash FROM devices WHERE code = $1 AND is_enabled = true LIMIT 1",
      [deviceCode],
    );
    const row = result.rows[0];
    const incomingHash = hashDeviceToken(token, options.deviceTokenPepper);
    if (!row || typeof row.auth_token_hash !== "string" || !hashesMatch(incomingHash, row.auth_token_hash)) {
      throw new DeviceAuthenticationError();
    }
    return { id: row.id, code: row.code };
  }

  async function getDeviceSnapshot(deviceId: string) {
    const result = await pool.query(`${deviceSelect} WHERE d.id = $1 LIMIT 1`, [deviceId]);
    return result.rows[0] ? mapConsoleDevice(result.rows[0]) : null;
  }

  async function getDeviceSnapshotAfterCommit(deviceId: string) {
    try { return await getDeviceSnapshot(deviceId); } catch (error) { onRealtimeError(error); return null; }
  }

  async function bootstrap(publicOnly: boolean) {
    const [summary, settings, services, categories, devices, alerts, events] = await Promise.all([
      getSummary(pool, publicOnly), getSettings(pool, publicOnly), getServices(pool, publicOnly), getCategories(pool, publicOnly),
      getDevices(pool, publicOnly), getAlerts(pool, publicOnly), getEvents(pool, publicOnly),
    ]);
    return { generatedAt: new Date().toISOString(), summary, settings, services, categories, devices, alerts, events };
  }

  return {
    getPublicBootstrap: () => bootstrap(true),
    getConsoleBootstrap: () => bootstrap(false),

    async getHomepageSnapshot({ limit, onlineOnly }: { limit: number; onlineOnly: boolean }) {
      const [summary, settings, devices] = await Promise.all([getSummary(pool, true), getSettings(pool, true), getDevices(pool, true)]);
      const selected = devices.filter((device) => !onlineOnly || device.currentState.isOnline).slice(0, limit);
      return {
        generatedAt: new Date().toISOString(), summary,
        map: settings ? {
          defaultCenterLng: settings.defaultCenterLng, defaultCenterLat: settings.defaultCenterLat,
          defaultZoom: settings.defaultZoom, mapProvider: settings.mapProvider,
          refreshHintSeconds: settings.refreshHintSeconds,
        } : null,
        devicesOnMapCount: selected.filter((device) => device.currentState.geoState.lng !== null && device.currentState.geoState.lat !== null).length,
        devices: selected,
      };
    },

    async getDeviceTrack(id: string, limit: number) {
      const result = await pool.query(
        `SELECT id, device_id, reported_at, mode, mission_status, battery_pct, signal_pct,
                speed_mps, heading_deg, altitude_m, display_coord_system, display_lng,
                display_lat, payload
         FROM device_telemetry WHERE device_id = $1 ORDER BY reported_at DESC LIMIT $2`,
        [id, limit],
      );
      return result.rows.map((row) => ({
        id: row.id, deviceId: row.device_id, reportedAt: row.reported_at,
        taskState: { mode: row.mode, missionStatus: row.mission_status },
        systemState: { batteryPct: numberOrNull(row.battery_pct), signalPct: numberOrNull(row.signal_pct) },
        geoState: { coordSystem: row.display_coord_system, lng: numberOrNull(row.display_lng), lat: numberOrNull(row.display_lat), speedMps: numberOrNull(row.speed_mps), headingDeg: numberOrNull(row.heading_deg), altitudeM: numberOrNull(row.altitude_m) },
        payload: objectOrEmpty(row.payload),
      }));
    },

    getDeviceEvents: (id: string, limit: number) => getEvents(pool, false, limit, id),

    async createDevice(input: MonitorDeviceInput, actorId: string) {
      if (!input.token) throw new MonitorValidationError("A token is required for a new device");
      const token = input.token;
      return transaction(pool, async (client) => {
        const categoryId = await resolveCategoryId(client, input.categoryCode);
        const result = await client.query(
          `INSERT INTO devices (
             code, category_id, name_zh, name_en, model, serial_number, protocol_type,
             auth_token_hash, is_enabled, is_public, sort_order, description_zh,
             description_en, metadata, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, now())
           RETURNING id`,
          [input.code, categoryId, input.name.zh, input.name.en, input.model, input.serialNumber,
            input.protocolType, hashDeviceToken(token, options.deviceTokenPepper), input.isEnabled,
            input.isPublic, input.sortOrder, input.description.zh, input.description.en, JSON.stringify(input.metadata)],
        );
        const deviceId = result.rows[0].id as string;
        await audit(client, actorId, "monitor.device.create", "monitor-device", deviceId, { code: input.code });
        return { deviceId };
      });
    },

    async updateDevice(id: string, input: MonitorDeviceInput, actorId: string) {
      return transaction(pool, async (client) => {
        const categoryId = await resolveCategoryId(client, input.categoryCode);
        const result = await client.query(
          `UPDATE devices SET code = $2, category_id = $3, name_zh = $4, name_en = $5,
             model = $6, serial_number = $7, protocol_type = $8,
             auth_token_hash = COALESCE($9, auth_token_hash), is_enabled = $10,
             is_public = $11, sort_order = $12, description_zh = $13,
             description_en = $14, metadata = $15::jsonb, updated_at = now()
           WHERE id = $1 RETURNING id`,
          [id, input.code, categoryId, input.name.zh, input.name.en, input.model, input.serialNumber,
            input.protocolType, input.token ? hashDeviceToken(input.token, options.deviceTokenPepper) : null,
            input.isEnabled, input.isPublic, input.sortOrder, input.description.zh, input.description.en,
            JSON.stringify(input.metadata)],
        );
        if (!result.rowCount) throw new MonitorNotFoundError("Device not found");
        await audit(client, actorId, "monitor.device.update", "monitor-device", id, { code: input.code, tokenRotated: Boolean(input.token) });
        return { deviceId: id };
      });
    },

    async disableDevice(id: string, actorId: string) {
      return transaction(pool, async (client) => {
        const result = await client.query("UPDATE devices SET is_enabled = false, updated_at = now() WHERE id = $1 RETURNING id", [id]);
        if (!result.rowCount) throw new MonitorNotFoundError("Device not found");
        await audit(client, actorId, "monitor.device.disable", "monitor-device", id);
        return { deviceId: id };
      });
    },

    async createCategory(input: MonitorCategoryInput, actorId: string) {
      return transaction(pool, async (client) => {
        const result = await client.query(
          `INSERT INTO device_categories (code, name_zh, name_en, icon, color, updated_at)
           VALUES ($1, $2, $3, $4, $5, now()) RETURNING id`,
          [input.code, input.name.zh, input.name.en, input.icon, input.color],
        );
        const id = result.rows[0].id as string;
        await audit(client, actorId, "monitor.category.create", "monitor-category", id, { code: input.code });
        return { categoryId: id };
      });
    },

    async updateCategory(id: string, input: MonitorCategoryInput, actorId: string) {
      return transaction(pool, async (client) => {
        const result = await client.query(
          `UPDATE device_categories SET code = $2, name_zh = $3, name_en = $4,
             icon = $5, color = $6, updated_at = now() WHERE id = $1 RETURNING id`,
          [id, input.code, input.name.zh, input.name.en, input.icon, input.color],
        );
        if (!result.rowCount) throw new MonitorNotFoundError("Category not found");
        await audit(client, actorId, "monitor.category.update", "monitor-category", id, { code: input.code });
        return { categoryId: id };
      });
    },

    async updateSettings(input: MonitorSettingsInput, actorId: string) {
      return transaction(pool, async (client) => {
        const result = await client.query(
          `UPDATE dashboard_settings SET default_center_lng = $1, default_center_lat = $2,
             default_zoom = $3, map_provider = $4, theme = $5,
             refresh_hint_seconds = $6, updated_at = now()
           WHERE id = (SELECT id FROM dashboard_settings ORDER BY updated_at DESC LIMIT 1)
           RETURNING id`,
          [input.defaultCenterLng, input.defaultCenterLat, input.defaultZoom, input.mapProvider,
            input.theme, input.refreshHintSeconds],
        );
        if (!result.rowCount) throw new MonitorNotFoundError("Dashboard settings not found");
        const id = result.rows[0].id as string;
        await audit(client, actorId, "monitor.settings.update", "monitor-settings", id);
        return { settingsId: id };
      });
    },

    async ingestHeartbeat(input: HeartbeatInput, token: string) {
      const device = await authenticateDevice(input.deviceCode, token);
      const reportedAt = await transaction(pool, (client) => upsertCurrentState(client, device.id, input, true));
      const snapshot = await getDeviceSnapshotAfterCommit(device.id);
      broadcastDevice("device.current-state.updated", { device: snapshot }, snapshot);
      return { device: snapshot, reportedAt };
    },

    async ingestTelemetry(input: TelemetryInput, token: string) {
      const device = await authenticateDevice(input.deviceCode, token);
      const reportedAt = await transaction(pool, async (client) => {
        const state = stateValues(input);
        await client.query(
          `INSERT INTO device_telemetry (
             device_id, reported_at, mode, mission_status, battery_pct, signal_pct,
             speed_mps, heading_deg, altitude_m, raw_coord_system, raw_lng, raw_lat,
             display_coord_system, display_lng, display_lat, payload
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)`,
          [device.id, input.reportedAt, state.mode, state.missionStatus, state.batteryPct,
            state.signalPct, state.speedMps, state.headingDeg, state.altitudeM, state.rawCoordSystem,
            state.rawLng, state.rawLat, state.coordSystem, state.lng, state.lat, JSON.stringify(state.payload)],
        );
        await upsertCurrentState(client, device.id, input, false);
        return input.reportedAt;
      });
      const snapshot = await getDeviceSnapshotAfterCommit(device.id);
      broadcastDevice("device.current-state.updated", { device: snapshot }, snapshot);
      broadcastDevice("device.telemetry.received", { deviceCode: device.code, reportedAt }, snapshot);
      return { device: snapshot };
    },

    async ingestEvent(input: EventInput, token: string) {
      const device = await authenticateDevice(input.deviceCode, token);
      const event = await transaction(pool, async (client) => {
        const result = await client.query(
          `INSERT INTO device_events (device_id, level, event_type, title, description, payload, occurred_at)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) RETURNING *`,
          [device.id, input.level, input.eventType, input.title, input.description ?? null,
            JSON.stringify(input.payload ?? {}), input.occurredAt],
        );
        return mapEvent({ ...result.rows[0], device_code: device.code, device_name: device.code });
      });
      const snapshot = await getDeviceSnapshotAfterCommit(device.id);
      broadcastDevice("device.event.received", { event }, snapshot);
      return { event };
    },

    async markOfflineDevices(offlineTimeoutSeconds: number) {
      const timedOut = await transaction(pool, async (client) => {
        const result = await client.query(
          `SELECT s.device_id, d.code
           FROM device_current_state s JOIN devices d ON d.id = s.device_id
           WHERE s.is_online = true
             AND d.is_enabled = true
             AND COALESCE(s.last_heartbeat_at, s.last_seen_at) < now() - ($1::int * interval '1 second')
           FOR UPDATE`,
          [offlineTimeoutSeconds],
        );
        if (!result.rowCount) return [];
        const ids = result.rows.map((row) => row.device_id);
        await client.query(
          "UPDATE device_current_state SET is_online = false, updated_at = now() WHERE device_id = ANY($1::uuid[])",
          [ids],
        );
        for (const row of result.rows) {
          const eventResult = await client.query(
            `INSERT INTO device_events (device_id, level, event_type, title, description, payload, occurred_at)
             VALUES ($1, 'warning', 'device.offline', $2, $3, $4::jsonb, now()) RETURNING *`,
            [row.device_id, `${row.code} is offline`, `${row.code} exceeded the heartbeat timeout`,
              JSON.stringify({ timeoutSeconds: offlineTimeoutSeconds })],
          );
          row.event = eventResult.rows[0];
        }
        return result.rows;
      });

      for (const row of timedOut) {
        try {
          const snapshot = await getDeviceSnapshot(row.device_id);
          const event = mapEvent({ ...row.event, device_code: row.code, device_name: snapshot?.displayName ?? row.code });
          const consolePayloads: Array<[string, unknown]> = [
            ["device.offline", { device: snapshot }],
            ["device.current-state.updated", { device: snapshot }],
            ["device.event.received", { event }],
          ];
          for (const [type, payload] of consolePayloads) safeBroadcast(type, payload, "console");
          if (snapshot?.isEnabled && snapshot.isPublic) {
            const publicDevice = publicDeviceFromConsole(snapshot);
            const publicEvent = publicEventFromConsole(event);
            const publicPayloads: Array<[string, unknown]> = [
              ["device.offline", { device: publicDevice }],
              ["device.current-state.updated", { device: publicDevice }],
              ["device.event.received", { event: publicEvent }],
            ];
            for (const [type, payload] of publicPayloads) safeBroadcast(type, payload, "public");
          }
        } catch (error) { onRealtimeError(error); }
      }
      return { count: timedOut.length };
    },
  };
}
