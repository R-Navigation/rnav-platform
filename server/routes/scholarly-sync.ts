import { Router, type RequestHandler, type Response } from "express";
import { ZodError } from "zod";
import { requireLogin } from "../middleware/auth.js";
import { requirePasswordChanged } from "../middleware/requirePasswordChanged.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { createRequireSameOrigin } from "../middleware/requireSameOrigin.js";
import { ProviderHttpError } from "../services/scholarly-sync/providers/http.js";
import { managedFieldsSchema, mergeWorkSchema, openAlexAuthorIdSchema, resolveAuthorSchema, resolveResearchItemSchema, scholarlyProfilePatchSchema, userIdSchema, verifyAuthorSchema, workIdSchema, researchItemIdSchema } from "../services/scholarly-sync/schemas.js";
import { ScholarlySyncError, type ScholarlySyncService } from "../services/scholarly-sync/service.js";

type Options = { authMiddleware: RequestHandler; service: ScholarlySyncService; trustProxy: boolean };
const parsedParam = <T>(schema: { parse(value: unknown): T }, value: unknown) => schema.parse(value);

function fail(response: Response, error: unknown) {
  if (error instanceof ZodError) { response.status(400).json({ error: "Validation failed", issues: error.issues }); return true; }
  if (error instanceof ScholarlySyncError) { response.status(error.status).json({ error: error.message, code: error.code }); return true; }
  if (error instanceof ProviderHttpError) { response.status(502).json({ error: `${error.provider} 暂时不可用`, code: "PROVIDER_UNAVAILABLE" }); return true; }
  if (error && typeof error === "object" && "code" in error && error.code === "23505") { response.status(409).json({ error: "ORCID、OpenAlex ID 或 DOI 已被其他记录使用", code: "EXTERNAL_ID_CONFLICT" }); return true; }
  if (error instanceof Error && /ORCID|OpenAlex|同步/.test(error.message)) { response.status(400).json({ error: error.message }); return true; }
  return false;
}

export function createScholarlySyncRouter({ authMiddleware, service, trustProxy }: Options) {
  const router = Router(); const sameOrigin = createRequireSameOrigin({ trustProxy });
  router.use("/api/scholarly-sync", authMiddleware, requireLogin, requirePasswordChanged);
  const action = (permission: string, handler: RequestHandler): RequestHandler[] => [requirePermission(permission), sameOrigin, handler];

  router.get("/api/scholarly-sync/members/:userId", requirePermission("site.members.write"), async (request, response, next) => {
    try { const profile = await service.getProfile(parsedParam(userIdSchema, request.params.userId)); if (!profile) { response.status(404).json({ error: "成员不存在" }); return; } response.json({ profile }); } catch (error) { if (!fail(response, error)) next(error); }
  });
  router.patch("/api/scholarly-sync/members/:userId", ...action("site.members.write", async (request, response, next) => {
    try { response.json({ profile: await service.updateProfile(parsedParam(userIdSchema, request.params.userId), scholarlyProfilePatchSchema.parse(request.body), request.authUser!.id) }); } catch (error) { if (!fail(response, error)) next(error); }
  }));
  router.post("/api/scholarly-sync/members/:userId/resolve", ...action("site.members.write", async (request, response, next) => {
    try { response.json({ candidates: await service.resolveAuthor(parsedParam(userIdSchema, request.params.userId), resolveAuthorSchema.parse(request.body)) }); } catch (error) { if (!fail(response, error)) next(error); }
  }));
  router.post("/api/scholarly-sync/members/:userId/verify-author", ...action("site.members.write", async (request, response, next) => {
    try { const body = verifyAuthorSchema.parse(request.body); response.json(await service.verifyAuthor(parsedParam(userIdSchema, request.params.userId), parsedParam(openAlexAuthorIdSchema, body.openalexAuthorId), request.authUser!.id)); } catch (error) { if (!fail(response, error)) next(error); }
  }));
  router.post("/api/scholarly-sync/members/:userId/sync", ...action("site.members.write", async (request, response, next) => {
    try { response.json(await service.syncMember(parsedParam(userIdSchema, request.params.userId), request.authUser!.id)); } catch (error) { if (!fail(response, error)) next(error); }
  }));

  router.get("/api/scholarly-sync/candidates", requirePermission("site.content.write"), async (request, response, next) => {
    try { const status = request.query.status === "ignored" ? "ignored" : "pending"; response.json({ candidates: await service.listCandidates(status) }); } catch (error) { if (!fail(response, error)) next(error); }
  });
  router.post("/api/scholarly-sync/works/:id/accept", ...action("site.content.write", async (request, response, next) => {
    try { response.json(await service.acceptWork(parsedParam(workIdSchema, request.params.id), request.authUser!.id)); } catch (error) { if (!fail(response, error)) next(error); }
  }));
  router.post("/api/scholarly-sync/works/:id/merge", ...action("site.content.write", async (request, response, next) => {
    try { const body = mergeWorkSchema.parse(request.body); response.json(await service.mergeWork(parsedParam(workIdSchema, request.params.id), body.researchItemId, request.authUser!.id)); } catch (error) { if (!fail(response, error)) next(error); }
  }));
  router.post("/api/scholarly-sync/works/:id/ignore", ...action("site.content.write", async (request, response, next) => {
    try { response.json(await service.ignoreWork(parsedParam(workIdSchema, request.params.id), request.authUser!.id)); } catch (error) { if (!fail(response, error)) next(error); }
  }));
  router.post("/api/scholarly-sync/works/:id/restore", ...action("site.content.write", async (request, response, next) => {
    try { response.json(await service.restoreWork(parsedParam(workIdSchema, request.params.id), request.authUser!.id)); } catch (error) { if (!fail(response, error)) next(error); }
  }));

  router.get("/api/scholarly-sync/research-items/:id", requirePermission("site.content.write"), async (request, response, next) => {
    try { response.json({ sync: await service.getResearchItemSyncInfo(parsedParam(researchItemIdSchema, request.params.id)) }); } catch (error) { if (!fail(response, error)) next(error); }
  });
  router.post("/api/scholarly-sync/research-items/:id/resolve-source", ...action("site.content.write", async (request, response, next) => {
    try { const body = resolveResearchItemSchema.parse(request.body ?? {}); response.json(await service.resolveResearchItemSource(parsedParam(researchItemIdSchema, request.params.id), request.authUser!.id, body.openalexWorkId)); } catch (error) { if (!fail(response, error)) next(error); }
  }));
  router.patch("/api/scholarly-sync/research-items/:id/managed-fields", ...action("site.content.write", async (request, response, next) => {
    try { const body = managedFieldsSchema.parse(request.body); response.json({ sync: await service.setManagedFields(parsedParam(researchItemIdSchema, request.params.id), body.managedFields, request.authUser!.id) }); } catch (error) { if (!fail(response, error)) next(error); }
  }));

  router.get("/api/scholarly-sync/status", requirePermission("site.content.write"), async (_request, response, next) => {
    try { response.json(await service.status()); } catch (error) { if (!fail(response, error)) next(error); }
  });
  router.post("/api/scholarly-sync/sync-all", ...action("site.content.write", async (request, response, next) => {
    try { response.json(await service.syncAll(request.authUser!.id)); } catch (error) { if (!fail(response, error)) next(error); }
  }));
  router.get("/api/scholarly-sync/runs", requirePermission("site.content.write"), async (_request, response, next) => {
    try { response.json({ runs: await service.listRuns() }); } catch (error) { if (!fail(response, error)) next(error); }
  });
  return router;
}
