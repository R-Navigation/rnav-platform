import { z } from "zod";

const text = z.string().max(20_000);
const code = z.string().trim().min(1).max(191);
const localized = z.object({ zh: text, en: text }).strict();
const finite = z.number().finite();
const percent = finite.min(0).max(100).nullable().optional();
const jetson = z.object({
  cpuTempC: finite.nullable().optional(), temperatureC: finite.nullable().optional(),
  cpuUsagePct: percent, memoryUsagePct: percent, gpuUsagePct: percent,
}).strict();
const safeJson = z.record(z.string(), z.unknown()).superRefine((value, context) => {
  let nodes = 0;
  let chars = 0;
  const visit = (current: unknown, depth: number, path: (string | number)[]) => {
    nodes += 1;
    if (nodes > 10_000 || depth > 20) context.addIssue({ code: z.ZodIssueCode.custom, message: "JSON is too large", path });
    if (typeof current === "string") { chars += current.length; if (current.length > 20_000 || chars > 200_000) context.addIssue({ code: z.ZodIssueCode.custom, message: "JSON strings are too large", path }); return; }
    if (current === null || typeof current === "boolean" || (typeof current === "number" && Number.isFinite(current))) return;
    if (typeof current !== "object") { context.addIssue({ code: z.ZodIssueCode.custom, message: "Value must be JSON-compatible", path }); return; }
    if (Array.isArray(current)) { if (current.length > 500) context.addIssue({ code: z.ZodIssueCode.custom, message: "List is too long", path }); current.forEach((item, index) => visit(item, depth + 1, [...path, index])); return; }
    for (const [key, item] of Object.entries(current)) { if (["__proto__", "prototype", "constructor"].includes(key)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Prototype keys are forbidden", path: [...path, key] }); visit(item, depth + 1, [...path, key]); }
  };
  visit(value, 0, []);
});

export const deviceRequestSchema = z.object({
  code, categoryCode: code.nullable(), name: localized, model: text, serialNumber: text,
  protocolType: z.enum(["http", "mqtt"]), isEnabled: z.boolean(), isPublic: z.boolean(),
  sortOrder: z.number().int().min(-1_000_000).max(1_000_000), description: localized,
  metadata: safeJson, token: z.string().min(32).max(512).optional(),
}).strict();

export const categoryRequestSchema = z.object({ code, name: localized, icon: text.max(120), color: z.string().max(64) }).strict();
export const settingsRequestSchema = z.object({
  defaultCenterLng: finite.min(-180).max(180), defaultCenterLat: finite.min(-90).max(90),
  defaultZoom: finite.min(0).max(24), mapProvider: z.enum(["maplibre"]), theme: z.string().min(1).max(64),
  refreshHintSeconds: z.number().int().min(1).max(300),
}).strict();

const stateSections = {
  taskState: z.object({ mode: text.nullable().optional(), missionStatus: text.nullable().optional() }).strict().optional(),
  systemState: z.object({ batteryPct: percent, signalPct: percent, jetson: jetson.optional() }).strict().optional(),
  geoState: z.object({ coordSystem: text.nullable().optional(), lng: finite.min(-180).max(180).nullable().optional(), lat: finite.min(-90).max(90).nullable().optional(), rawCoordSystem: text.nullable().optional(), rawLng: finite.min(-180).max(180).nullable().optional(), rawLat: finite.min(-90).max(90).nullable().optional(), speedMps: finite.nullable().optional(), headingDeg: finite.min(0).max(360).nullable().optional(), altitudeM: finite.nullable().optional() }).strict().optional(),
};
const legacyStateFields = {
  mode: text.nullable().optional(), missionStatus: text.nullable().optional(), batteryPct: percent, signalPct: percent,
  speedMps: finite.nullable().optional(), headingDeg: finite.min(0).max(360).nullable().optional(), altitudeM: finite.nullable().optional(),
  coordSystem: text.nullable().optional(), lng: finite.min(-180).max(180).nullable().optional(), lat: finite.min(-90).max(90).nullable().optional(),
  rawCoordSystem: text.nullable().optional(), rawLng: finite.min(-180).max(180).nullable().optional(), rawLat: finite.min(-90).max(90).nullable().optional(),
  displayCoordSystem: text.nullable().optional(), displayLng: finite.min(-180).max(180).nullable().optional(), displayLat: finite.min(-90).max(90).nullable().optional(),
};
const normalizeState = <T extends Record<string, any>>(input: T) => {
  const output: Record<string, any> = { ...input };
  const taskState = input.taskState ?? (input.mode !== undefined || input.missionStatus !== undefined ? { mode: input.mode, missionStatus: input.missionStatus } : undefined);
  const systemState = input.systemState ?? (input.batteryPct !== undefined || input.signalPct !== undefined ? { batteryPct: input.batteryPct, signalPct: input.signalPct } : undefined);
  const geoState = input.geoState ?? (["speedMps", "headingDeg", "altitudeM", "coordSystem", "lng", "lat", "rawCoordSystem", "rawLng", "rawLat", "displayCoordSystem", "displayLng", "displayLat"].some((key) => input[key] !== undefined) ? {
    speedMps: input.speedMps, headingDeg: input.headingDeg, altitudeM: input.altitudeM,
    coordSystem: input.displayCoordSystem ?? input.coordSystem,
    lng: input.displayLng ?? input.lng, lat: input.displayLat ?? input.lat,
    rawCoordSystem: input.rawCoordSystem ?? input.coordSystem,
    rawLng: input.rawLng ?? input.lng, rawLat: input.rawLat ?? input.lat,
  } : undefined);
  if (taskState !== undefined) output.taskState = taskState;
  if (systemState !== undefined) output.systemState = systemState;
  if (geoState !== undefined) output.geoState = geoState;
  return output;
};
const stripLegacyState = <T extends Record<string, any>>(input: T) => {
  const output = normalizeState(input);
  for (const key of Object.keys(legacyStateFields)) delete output[key];
  return output;
};
export const ingestTelemetrySchema = z.object({ deviceCode: code, reportedAt: z.string().datetime(), ...stateSections, ...legacyStateFields, payload: safeJson.optional() }).strict().transform(stripLegacyState);
export const ingestHeartbeatSchema = z.object({ deviceCode: code, reportedAt: z.string().datetime().optional(), ...stateSections, ...legacyStateFields, heartbeatSections: z.array(z.string().max(100)).max(100).optional(), payload: safeJson.optional() }).strict().transform(stripLegacyState);
export const ingestEventSchema = z.object({ deviceCode: code, occurredAt: z.string().datetime(), level: z.enum(["info", "warning", "error", "critical"]), eventType: code, title: text.min(1), description: text.nullable().optional(), payload: safeJson.optional() }).strict();
