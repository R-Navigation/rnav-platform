import { Router, type RequestHandler } from "express";
import { ZodError, z } from "zod";
import { requireLogin } from "../middleware/auth.js";
import { requirePasswordChanged } from "../middleware/requirePasswordChanged.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { createRequireSameOrigin } from "../middleware/requireSameOrigin.js";
import { ProviderHttpError } from "../services/scholarly-sync/providers/http.js";
import type { ScholarlySyncService } from "../services/scholarly-sync/service.js";
import { SettingsError, type SettingsService } from "../services/settings/settingsService.js";
import type { ScholarlySyncSettingsService } from "../services/settings/scholarlySyncSettingsService.js";

const body = z.object({ value: z.unknown(), version: z.number().int().positive() }).strict();
const globalBody = z.object({
  enabled: z.boolean(),
  crossrefContactEmail: z.union([z.string().trim().email().max(320), z.literal("")]).transform((value) => value || null),
  version: z.number().int().min(0),
  openAlexApiKey: z.string().trim().min(8).max(512).optional(),
}).strict();
const memberBody = z.object({
  syncEnabled: z.boolean().optional(),
  newWorkPolicy: z.enum(["auto", "review"]).optional(),
}).strict().refine((value) => value.syncEnabled !== undefined || value.newWorkPolicy !== undefined, "至少提交一项成员同步设置");
const bulkBody = z.object({ operation: z.enum(["enable_sync", "review_all"]) }).strict();
const uuid = z.string().uuid();

export function createSettingsRouter({ authMiddleware, service, scholarlySettings, scholarlySync, trustProxy }: {
  authMiddleware: RequestHandler;
  service: SettingsService;
  scholarlySettings: ScholarlySyncSettingsService;
  scholarlySync: ScholarlySyncService;
  trustProxy: boolean;
}) {
  const router = Router();
  const sameOrigin = createRequireSameOrigin({ trustProxy });
  router.use("/api/settings", authMiddleware, requireLogin, requirePasswordChanged, requirePermission("system.settings.write"));

  const handle = (error: unknown, response: any, next: any) => {
    if (error instanceof ZodError) response.status(400).json({ code: "VALIDATION_ERROR", error: "Validation failed", issues: error.issues });
    else if (error instanceof SettingsError) response.status(error.status).json({ code: error.code, error: error.message });
    else if (error instanceof ProviderHttpError) response.status(502).json({ code: "OPENALEX_CHECK_FAILED", error: `OpenAlex 检测失败（HTTP ${error.status}）` });
    else next(error);
  };

  router.get("/api/settings", async (_request, response, next) => {
    try { response.json({ settings: await service.getAll() }); } catch (error) { handle(error, response, next); }
  });
  router.get("/api/settings/scholarly-sync", async (_request, response, next) => {
    try { response.json({ ...(await scholarlySettings.getOverview()), status: await scholarlySync.status() }); }
    catch (error) { handle(error, response, next); }
  });
  router.put("/api/settings/scholarly-sync", sameOrigin, async (request, response, next) => {
    try {
      const result = await scholarlySettings.updateGlobal(globalBody.parse(request.body), request.authUser!.id);
      if (result.keyChanged) await scholarlySync.resetOpenAlexStatus();
      response.json({ ...(await scholarlySettings.getOverview()), status: await scholarlySync.status() });
    } catch (error) { handle(error, response, next); }
  });
  router.post("/api/settings/scholarly-sync/openalex/check", sameOrigin, async (request, response, next) => {
    try { response.json({ status: await scholarlySync.checkOpenAlexStatus(request.authUser!.id) }); }
    catch (error) { handle(error, response, next); }
  });
  router.patch("/api/settings/scholarly-sync/members/:userId", sameOrigin, async (request, response, next) => {
    try { response.json({ member: await scholarlySettings.updateMember(uuid.parse(request.params.userId), memberBody.parse(request.body), request.authUser!.id) }); }
    catch (error) { handle(error, response, next); }
  });
  router.post("/api/settings/scholarly-sync/members/bulk", sameOrigin, async (request, response, next) => {
    try { response.json(await scholarlySettings.bulkMembers(bulkBody.parse(request.body).operation, request.authUser!.id)); }
    catch (error) { handle(error, response, next); }
  });
  router.put("/api/settings/:key", sameOrigin, async (request, response, next) => {
    try {
      const parsed = body.parse(request.body);
      const key = Array.isArray(request.params.key) ? request.params.key[0] : request.params.key;
      response.json(await service.update(key, parsed.value, parsed.version, request.authUser!.id));
    } catch (error) { handle(error, response, next); }
  });
  return router;
}
