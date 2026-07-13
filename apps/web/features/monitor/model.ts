export type MonitorCategory = { id?: string; code: string; nameZh: string; nameEn: string; color: string; icon: string };
export type MonitorState = {
  isOnline: boolean;
  lastSeenAt: string | null;
  lastHeartbeatAt: string | null;
  taskState: { mode: string | null; missionStatus: string | null };
  systemState: { batteryPct: number | null; signalPct: number | null };
  geoState: { coordSystem: string | null; lng: number | null; lat: number | null; speedMps: number | null; headingDeg: number | null; altitudeM: number | null };
  updatedAt: string | null;
};
export type MonitorDevice = {
  id?: string; code: string; nameZh: string; nameEn: string; displayName: string; model: string;
  serialNumber: string; protocolType: "http" | "mqtt"; isEnabled: boolean; isPublic: boolean;
  sortOrder: number; descriptionZh: string; descriptionEn: string; metadata: Record<string, unknown>;
  category: MonitorCategory | null; currentState: MonitorState;
};
export type MonitorEvent = { id?: string; deviceId?: string; deviceCode: string; deviceName: string; level: string; eventType: string; title: string; description: string | null; occurredAt: string };
export type MonitorAlert = { id?: string; deviceId?: string; deviceCode: string; deviceName: string; alertType: string; severity: string; title: string; description: string | null; status: string; startedAt: string; endedAt: string | null };
export type MonitorSnapshot = {
  generatedAt: string;
  summary: { onlineDeviceCount: number; totalDeviceCount: number; alertCount: number; lastUpdatedAt: string | null };
  settings: { id?: string; defaultCenterLng: number; defaultCenterLat: number; defaultZoom: number; mapProvider: "maplibre"; theme: string; refreshHintSeconds: number };
  categories: MonitorCategory[]; devices: MonitorDevice[]; alerts: MonitorAlert[]; events: MonitorEvent[];
  services: Array<{ key: string; name: string; online: boolean; statusText: string; lastCheckAt: string | null }>;
};

type UnknownRecord = Record<string, unknown>;
const record = (value: unknown): UnknownRecord => value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
const list = (value: unknown) => Array.isArray(value) ? value : [];
const text = (value: unknown) => value == null ? "" : String(value);
const optionalText = (value: unknown) => value == null ? null : String(value);
const number = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const nullableNumber = (value: unknown) => value == null || !Number.isFinite(Number(value)) ? null : Number(value);

function normalizeCategory(value: unknown): MonitorCategory | null {
  const item = record(value);
  if (!item.code) return null;
  return { ...(item.id ? { id: text(item.id) } : {}), code: text(item.code), nameZh: text(item.nameZh), nameEn: text(item.nameEn), color: text(item.color), icon: text(item.icon) };
}

function normalizeDevice(value: unknown): MonitorDevice {
  const item = record(value); const state = record(item.currentState); const task = record(state.taskState); const system = record(state.systemState); const geo = record(state.geoState);
  return {
    ...(item.id ? { id: text(item.id) } : {}), code: text(item.code), nameZh: text(item.nameZh), nameEn: text(item.nameEn), displayName: text(item.displayName || item.nameZh || item.nameEn || item.code),
    model: text(item.model), serialNumber: text(item.serialNumber), protocolType: item.protocolType === "mqtt" ? "mqtt" : "http", isEnabled: item.isEnabled !== false, isPublic: item.isPublic !== false,
    sortOrder: number(item.sortOrder), descriptionZh: text(item.descriptionZh), descriptionEn: text(item.descriptionEn), metadata: record(item.metadata), category: normalizeCategory(item.category),
    currentState: { isOnline: Boolean(state.isOnline), lastSeenAt: optionalText(state.lastSeenAt), lastHeartbeatAt: optionalText(state.lastHeartbeatAt), taskState: { mode: optionalText(task.mode), missionStatus: optionalText(task.missionStatus) }, systemState: { batteryPct: nullableNumber(system.batteryPct), signalPct: nullableNumber(system.signalPct) }, geoState: { coordSystem: optionalText(geo.coordSystem), lng: nullableNumber(geo.lng), lat: nullableNumber(geo.lat), speedMps: nullableNumber(geo.speedMps), headingDeg: nullableNumber(geo.headingDeg), altitudeM: nullableNumber(geo.altitudeM) }, updatedAt: optionalText(state.updatedAt) },
  };
}

function normalizeEvent(value: unknown): MonitorEvent { const item = record(value); return { ...(item.id ? { id: text(item.id) } : {}), ...(item.deviceId ? { deviceId: text(item.deviceId) } : {}), deviceCode: text(item.deviceCode), deviceName: text(item.deviceName), level: text(item.level), eventType: text(item.eventType), title: text(item.title), description: optionalText(item.description), occurredAt: text(item.occurredAt) }; }
function normalizeAlert(value: unknown): MonitorAlert { const item = record(value); return { ...(item.id ? { id: text(item.id) } : {}), ...(item.deviceId ? { deviceId: text(item.deviceId) } : {}), deviceCode: text(item.deviceCode), deviceName: text(item.deviceName), alertType: text(item.alertType), severity: text(item.severity), title: text(item.title), description: optionalText(item.description), status: text(item.status), startedAt: text(item.startedAt), endedAt: optionalText(item.endedAt) }; }

export function normalizeMonitorSnapshot(value: unknown): MonitorSnapshot {
  const source = record(value); const summary = record(source.summary); const settings = record(source.settings);
  return {
    generatedAt: text(source.generatedAt), summary: { onlineDeviceCount: number(summary.onlineDeviceCount), totalDeviceCount: number(summary.totalDeviceCount), alertCount: number(summary.alertCount), lastUpdatedAt: optionalText(summary.lastUpdatedAt) },
    settings: { ...(settings.id ? { id: text(settings.id) } : {}), defaultCenterLng: number(settings.defaultCenterLng, 114.361111), defaultCenterLat: number(settings.defaultCenterLat, 30.540833), defaultZoom: number(settings.defaultZoom, 13.2), mapProvider: "maplibre", theme: text(settings.theme || "nightwatch"), refreshHintSeconds: number(settings.refreshHintSeconds, 5) },
    categories: list(source.categories).map(normalizeCategory).filter((item): item is MonitorCategory => item !== null), devices: list(source.devices).map(normalizeDevice), alerts: list(source.alerts).map(normalizeAlert), events: list(source.events).map(normalizeEvent),
    services: list(source.services).map((value) => { const item = record(value); return { key: text(item.key), name: text(item.name), online: Boolean(item.online), statusText: text(item.statusText), lastCheckAt: optionalText(item.lastCheckAt) }; }),
  };
}

export function applyMonitorMessage(snapshot: MonitorSnapshot, message: unknown): MonitorSnapshot {
  const envelope = record(message); const payload = record(envelope.payload);
  if (envelope.type === "device.current-state.updated" || envelope.type === "device.offline") {
    const next = normalizeDevice(payload.device); const key = next.id || next.code;
    return { ...snapshot, generatedAt: new Date().toISOString(), devices: snapshot.devices.map((device) => (device.id || device.code) === key ? next : device) };
  }
  if (envelope.type === "device.event.received") return { ...snapshot, events: [normalizeEvent(payload.event), ...snapshot.events].slice(0, 50) };
  return snapshot;
}

export function canManageMonitor(permissions: string[]) {
  const available = new Set(permissions);
  return { read: available.has("monitor.devices.read"), devices: available.has("monitor.devices.write"), settings: available.has("monitor.settings.write") };
}
