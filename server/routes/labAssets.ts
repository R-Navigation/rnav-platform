import { Router, type Request, type RequestHandler } from "express";
import { z, ZodError } from "zod";
import { requireLogin } from "../middleware/auth.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { createRequireSameOrigin } from "../middleware/requireSameOrigin.js";
import {
  ConflictError,
  RevisionConflictError,
  type LabAssetsService,
} from "../services/lab-assets/labAssetsService.js";
import {
  assetRequestSchema,
  codeParamSchema,
  deleteRequestSchema,
  noteIdParamSchema,
  noteRequestSchema,
  pageRequestSchema,
  platformRequestSchema,
  platformTypeRequestSchema,
} from "../services/lab-assets/schemas.js";

type Options = { authMiddleware: RequestHandler; service: LabAssetsService; trustProxy: boolean };

export function createLabAssetsRouter({ authMiddleware, service, trustProxy }: Options) {
  const router = Router();
  const requireSameOrigin = createRequireSameOrigin({ trustProxy });
  const requireReadOrWrite: RequestHandler = (request, response, next) => {
    const permissions = request.authUser?.permissions ?? [];
    if (permissions.includes("lab_assets.read") || permissions.includes("lab_assets.write")) next();
    else response.status(403).json({ error: "Permission denied" });
  };

  router.use("/api/lab-assets", authMiddleware, requireLogin);
  router.get("/api/lab-assets", requireReadOrWrite, async (_request, response, next) => {
    try {
      response.json(await service.getSnapshot());
    } catch (error) {
      next(error);
    }
  });

  const mutation = <TSchema extends z.ZodTypeAny>(
    schema: TSchema,
    invoke: (request: Request, body: z.output<TSchema>) => Promise<string>,
  ): RequestHandler[] => [
    requirePermission("lab_assets.write"),
    requireSameOrigin,
    async (request, response, next) => {
      try {
        const body = schema.parse(request.body);
        response.json({ revision: await invoke(request, body) });
      } catch (error) {
        if (error instanceof ZodError) {
          response.status(400).json({ error: "Validation failed", issues: error.issues });
        } else if (error instanceof ConflictError || error instanceof RevisionConflictError) {
          response.status(409).json({ error: error.message });
        } else {
          next(error);
        }
      }
    },
  ];
  const code = (request: Request) => codeParamSchema.parse(request.params.code);
  const noteId = (request: Request) => noteIdParamSchema.parse(request.params.noteId);
  const actorId = (request: Request) => request.authUser!.id;

  router.put("/api/lab-assets/page", ...mutation(pageRequestSchema, (r, b) => service.updatePage(b.page, b.expectedRevision, actorId(r))));
  router.post("/api/lab-assets/platform-types", ...mutation(platformTypeRequestSchema, (r, b) => service.createPlatformType(b, b.expectedRevision, actorId(r))));
  router.put("/api/lab-assets/platform-types/:code", ...mutation(platformTypeRequestSchema, (r, b) => service.updatePlatformType(code(r), b, b.expectedRevision, actorId(r))));
  router.delete("/api/lab-assets/platform-types/:code", ...mutation(deleteRequestSchema, (r, b) => service.deletePlatformType(code(r), b.expectedRevision, actorId(r))));
  router.post("/api/lab-assets/platforms", ...mutation(platformRequestSchema, (r, b) => service.createPlatform(b, b.expectedRevision, actorId(r))));
  router.put("/api/lab-assets/platforms/:code", ...mutation(platformRequestSchema, (r, b) => service.updatePlatform(code(r), b, b.expectedRevision, actorId(r))));
  router.delete("/api/lab-assets/platforms/:code", ...mutation(deleteRequestSchema, (r, b) => service.deletePlatform(code(r), b.expectedRevision, actorId(r))));
  router.post("/api/lab-assets/platforms/:code/notes", ...mutation(noteRequestSchema, (r, b) => service.addPlatformNote(code(r), b, b.expectedRevision, actorId(r))));
  router.delete("/api/lab-assets/platforms/:code/notes/:noteId", ...mutation(deleteRequestSchema, (r, b) => service.deletePlatformNote(code(r), noteId(r), b.expectedRevision, actorId(r))));
  router.post("/api/lab-assets/assets", ...mutation(assetRequestSchema, (r, b) => service.createAsset(b, b.expectedRevision, actorId(r))));
  router.put("/api/lab-assets/assets/:code", ...mutation(assetRequestSchema, (r, b) => service.updateAsset(code(r), b, b.expectedRevision, actorId(r))));
  router.delete("/api/lab-assets/assets/:code", ...mutation(deleteRequestSchema, (r, b) => service.deleteAsset(code(r), b.expectedRevision, actorId(r))));
  router.post("/api/lab-assets/assets/:code/notes", ...mutation(noteRequestSchema, (r, b) => service.addAssetNote(code(r), b, b.expectedRevision, actorId(r))));
  router.delete("/api/lab-assets/assets/:code/notes/:noteId", ...mutation(deleteRequestSchema, (r, b) => service.deleteAssetNote(code(r), noteId(r), b.expectedRevision, actorId(r))));

  return router;
}
