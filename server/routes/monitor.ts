import { Router, type RequestHandler } from "express";
import { z, ZodError } from "zod";
import { requireLogin } from "../middleware/auth.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { requirePasswordChanged } from "../middleware/requirePasswordChanged.js";
import { createRequireSameOrigin } from "../middleware/requireSameOrigin.js";
import { DeviceAuthenticationError, MonitorNotFoundError, MonitorValidationError } from "../services/monitor/monitorService.js";
import { categoryRequestSchema, deviceRequestSchema, ingestEventSchema, ingestHeartbeatSchema, ingestTelemetrySchema, settingsRequestSchema } from "../services/monitor/schemas.js";

export type MonitorService = {
  getPublicBootstrap(): Promise<unknown>; getHomepageSnapshot(input: { limit: number; onlineOnly: boolean }): Promise<unknown>;
  getConsoleBootstrap(): Promise<unknown>; getDeviceTrack(id: string, limit: number): Promise<unknown>; getDeviceEvents(id: string, limit: number): Promise<unknown>;
  createDevice(body: z.output<typeof deviceRequestSchema>, actorId: string): Promise<unknown>; updateDevice(id: string, body: z.output<typeof deviceRequestSchema>, actorId: string): Promise<unknown>; disableDevice(id: string, actorId: string): Promise<unknown>;
  createCategory(body: z.output<typeof categoryRequestSchema>, actorId: string): Promise<unknown>; updateCategory(id: string, body: z.output<typeof categoryRequestSchema>, actorId: string): Promise<unknown>;
  updateSettings(body: z.output<typeof settingsRequestSchema>, actorId: string): Promise<unknown>;
  ingestHeartbeat(body: z.output<typeof ingestHeartbeatSchema>, token: string): Promise<unknown>; ingestTelemetry(body: z.output<typeof ingestTelemetrySchema>, token: string): Promise<unknown>; ingestEvent(body: z.output<typeof ingestEventSchema>, token: string): Promise<unknown>;
};

function deviceToken(request: { headers: Record<string, unknown> }) {
  const authorization = request.headers.authorization;
  if (typeof authorization === "string" && authorization.startsWith("Bearer ")) return authorization.slice(7).trim();
  const header = request.headers["x-device-token"];
  return typeof header === "string" ? header.trim() : "";
}
function limit(value: unknown, fallback: number, max: number) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 1), max) : fallback; }
function routeParam(value: string | string[]) { return Array.isArray(value) ? value[0] : value; }
const uuidParam = z.string().uuid();
function requireAnyPermission(permissions: string[]): RequestHandler {
  return (request, response, next) => {
    if (!request.authUser) { response.status(401).json({ error: "Authentication required" }); return; }
    if (!permissions.some((permission) => request.authUser!.permissions.includes(permission))) { response.status(403).json({ error: "Permission denied" }); return; }
    next();
  };
}
function parsedId(value: string | string[], response: Parameters<RequestHandler>[1]) {
  const parsed = uuidParam.safeParse(routeParam(value));
  if (!parsed.success) response.status(400).json({ error: "Invalid monitor resource id" });
  return parsed.success ? parsed.data : null;
}

export function createMonitorRouter({ authMiddleware, service, trustProxy }: { authMiddleware: RequestHandler; service: MonitorService; trustProxy: boolean }) {
  const router = Router();
  const sameOrigin = createRequireSameOrigin({ trustProxy });
  const handler = <T extends z.ZodTypeAny>(schema: T, invoke: (body: z.output<T>, request: Parameters<RequestHandler>[0]) => Promise<unknown>): RequestHandler => async (request, response, next) => {
    try { response.json(await invoke(schema.parse(request.body), request)); }
    catch (error) { if (error instanceof ZodError) response.status(400).json({ error: "Validation failed", issues: error.issues }); else next(error); }
  };

  router.get("/api/monitor/public/bootstrap", async (_request, response, next) => { try { response.json(await service.getPublicBootstrap()); } catch (error) { next(error); } });
  router.get("/api/monitor/public/homepage-snapshot", async (request, response, next) => { try { response.json(await service.getHomepageSnapshot({ limit: limit(request.query.limit, 12, 50), onlineOnly: ["1", "true", "yes", "on"].includes(String(request.query.onlineOnly ?? "").toLowerCase()) })); } catch (error) { next(error); } });

  router.use("/api/monitor/console", authMiddleware, requireLogin, requirePasswordChanged);
  router.get("/api/monitor/console/bootstrap", requireAnyPermission(["monitor.devices.read", "monitor.devices.write", "monitor.settings.write"]), async (request, response, next) => {
    try {
      const snapshot = await service.getConsoleBootstrap();
      const canReadDevices = request.authUser!.permissions.some((permission) => permission === "monitor.devices.read" || permission === "monitor.devices.write");
      response.json(canReadDevices ? snapshot : { ...(snapshot as Record<string, unknown>), devices: [], alerts: [], events: [] });
    } catch (error) { next(error); }
  });
  router.get("/api/monitor/console/devices/:id/track", requirePermission("monitor.devices.read"), async (request, response, next) => { const id = parsedId(request.params.id, response); if (!id) return; try { response.json(await service.getDeviceTrack(id, limit(request.query.limit, 200, 1000))); } catch (error) { next(error); } });
  router.get("/api/monitor/console/devices/:id/events", requirePermission("monitor.devices.read"), async (request, response, next) => { const id = parsedId(request.params.id, response); if (!id) return; try { response.json(await service.getDeviceEvents(id, limit(request.query.limit, 24, 200))); } catch (error) { next(error); } });
  router.post("/api/monitor/console/devices", requirePermission("monitor.devices.write"), sameOrigin, handler(deviceRequestSchema, (body, request) => service.createDevice(body, request.authUser!.id)));
  router.put("/api/monitor/console/devices/:id", requirePermission("monitor.devices.write"), sameOrigin, async (request, response, next) => { const id = parsedId(request.params.id, response); if (!id) return; try { response.json(await service.updateDevice(id, deviceRequestSchema.parse(request.body), request.authUser!.id)); } catch (error) { if (error instanceof ZodError) response.status(400).json({ error: "Validation failed", issues: error.issues }); else next(error); } });
  router.delete("/api/monitor/console/devices/:id", requirePermission("monitor.devices.write"), sameOrigin, async (request, response, next) => { const id = parsedId(request.params.id, response); if (!id) return; try { response.json(await service.disableDevice(id, request.authUser!.id)); } catch (error) { next(error); } });
  router.post("/api/monitor/console/categories", requirePermission("monitor.devices.write"), sameOrigin, handler(categoryRequestSchema, (body, request) => service.createCategory(body, request.authUser!.id)));
  router.put("/api/monitor/console/categories/:id", requirePermission("monitor.devices.write"), sameOrigin, async (request, response, next) => { const id = parsedId(request.params.id, response); if (!id) return; try { response.json(await service.updateCategory(id, categoryRequestSchema.parse(request.body), request.authUser!.id)); } catch (error) { if (error instanceof ZodError) response.status(400).json({ error: "Validation failed", issues: error.issues }); else next(error); } });
  router.put("/api/monitor/console/settings", requirePermission("monitor.settings.write"), sameOrigin, handler(settingsRequestSchema, (body, request) => service.updateSettings(body, request.authUser!.id)));

  const heartbeat = handler(ingestHeartbeatSchema, (body, request) => service.ingestHeartbeat(body, deviceToken(request)));
  const telemetry = handler(ingestTelemetrySchema, (body, request) => service.ingestTelemetry(body, deviceToken(request)));
  const event = handler(ingestEventSchema, (body, request) => service.ingestEvent(body, deviceToken(request)));
  for (const prefix of ["/api/monitor", "/monitor/api"]) {
    router.post(`${prefix}/ingest/v1/heartbeat`, heartbeat);
    router.post(`${prefix}/ingest/v1/telemetry`, telemetry);
    router.post(`${prefix}/ingest/v1/event`, event);
  }
  router.use(((error, _request, response, next) => {
    if (error instanceof DeviceAuthenticationError) { response.status(401).json({ error: "Invalid device credentials" }); return; }
    if (error instanceof MonitorValidationError) { response.status(400).json({ error: error.message }); return; }
    if (error instanceof MonitorNotFoundError) { response.status(404).json({ error: error.message }); return; }
    if (error && typeof error === "object" && (error as { code?: unknown }).code === "23505") { response.status(409).json({ error: "Monitor record already exists" }); return; }
    if (error && typeof error === "object" && (error as { code?: unknown }).code === "22P02") { response.status(400).json({ error: "Invalid monitor resource id" }); return; }
    next(error);
  }) as import("express").ErrorRequestHandler);
  return router;
}
