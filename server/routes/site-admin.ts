import { Router, type RequestHandler } from "express";
import { z, ZodError } from "zod";
import { requireLogin } from "../middleware/auth.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { createRequireSameOrigin } from "../middleware/requireSameOrigin.js";
import { AssetReferenceError, RevisionConflictError } from "../services/site-admin/postgres-repository.js";
import { collectionRequestSchemas, pageKeySchema, pageRequestSchema, type ContactItems, type SiteRecord } from "../services/site-admin/schemas.js";
import type { SiteAdminService } from "../services/site-admin/service.js";

type Options = { authMiddleware: RequestHandler; service: SiteAdminService; trustProxy: boolean };

function requireAnyPermission(permissions: string[]): RequestHandler {
  return (request, response, next) => {
    if (!request.authUser) { response.status(401).json({ error: "Authentication required" }); return; }
    if (!permissions.some((permission) => request.authUser!.permissions.includes(permission))) {
      response.status(403).json({ error: "Permission denied" }); return;
    }
    next();
  };
}

function validationError(response: Parameters<RequestHandler>[1], error: ZodError) {
  response.status(400).json({ error: "Validation failed", issues: error.issues });
}

export function createSiteAdminRouter({ authMiddleware, service, trustProxy }: Options) {
  const router = Router();
  const requireSameOrigin = createRequireSameOrigin({ trustProxy });
  router.use("/api/site-admin", authMiddleware, requireLogin);

  router.get("/api/site-admin/snapshot", requireAnyPermission(["site.content.write", "site.members.write"]), async (_request, response, next) => {
    try { response.json(await service.getSnapshot()); } catch (error) { next(error); }
  });

  const mutation = <TSchema extends z.ZodTypeAny>(permission: string, schema: TSchema, save: (body: z.output<TSchema>, actorId: string) => Promise<string>): RequestHandler[] => [
    requirePermission(permission), requireSameOrigin,
    async (request, response, next) => {
      try {
        const body = schema.parse(request.body);
        response.json({ updatedAt: await save(body, request.authUser!.id) });
      } catch (error) {
        if (error instanceof ZodError) { validationError(response, error); return; }
        if (error instanceof RevisionConflictError) { response.status(409).json({ error: "Content revision conflict" }); return; }
        if (error instanceof AssetReferenceError) { response.status(400).json({ error: "Invalid asset reference" }); return; }
        next(error);
      }
    }
  ];

  const replacePage: RequestHandler = async (request, response, next) => {
    const parsed = pageKeySchema.safeParse(request.params.pageKey);
    if (!parsed.success) { response.status(400).json({ error: "Validation failed", issues: parsed.error.issues }); return; }
    try {
      const body = pageRequestSchema.parse(request.body);
      response.json({ updatedAt: await service.replacePage(parsed.data, body.content, body.expectedUpdatedAt, request.authUser!.id) });
    } catch (error) {
      if (error instanceof ZodError) { validationError(response, error); return; }
      if (error instanceof RevisionConflictError) { response.status(409).json({ error: "Content revision conflict" }); return; }
      if (error instanceof AssetReferenceError) { response.status(400).json({ error: "Invalid asset reference" }); return; }
      next(error);
    }
  };
  router.put("/api/site-admin/pages/:pageKey", requirePermission("site.content.write"), requireSameOrigin, replacePage);

  type CollectionBody = { items: SiteRecord[]; expectedUpdatedAt: string };
  type ContactBody = { items: ContactItems; expectedUpdatedAt: string };
  router.put("/api/site-admin/research-items", ...mutation("site.content.write", collectionRequestSchemas.research, (body: CollectionBody, actorId) => service.replaceResearchItems(body.items, body.expectedUpdatedAt, actorId)));
  router.put("/api/site-admin/news-items", ...mutation("site.content.write", collectionRequestSchemas.news, (body: CollectionBody, actorId) => service.replaceNewsItems(body.items, body.expectedUpdatedAt, actorId)));
  router.put("/api/site-admin/team-members", ...mutation("site.members.write", collectionRequestSchemas.team, (body: CollectionBody, actorId) => service.replaceTeamMembers(body.items, body.expectedUpdatedAt, actorId)));
  router.put("/api/site-admin/facility-items", ...mutation("site.content.write", collectionRequestSchemas.facility, (body: CollectionBody, actorId) => service.replaceFacilityItems(body.items, body.expectedUpdatedAt, actorId)));
  router.put("/api/site-admin/contact-items", ...mutation("site.content.write", collectionRequestSchemas.contact, (body: ContactBody, actorId) => service.replaceContactItems(body.items, body.expectedUpdatedAt, actorId)));
  return router;
}
