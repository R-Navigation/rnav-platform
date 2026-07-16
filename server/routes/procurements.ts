import { Router, type RequestHandler } from "express";
import { ZodError } from "zod";
import { requireLogin } from "../middleware/auth.js";
import { requirePasswordChanged } from "../middleware/requirePasswordChanged.js";
import { createRequireSameOrigin } from "../middleware/requireSameOrigin.js";
import { ProcurementAccessError, ProcurementConflictError, ProcurementNotFoundError, type ProcurementService } from "../services/procurement/procurementService.js";
import { catalogCategorySchema, catalogItemSchema, catalogQuerySchema, commentSchema, createProcurementSchema, procurementIdSchema, procurementListQuerySchema, transitionSchema } from "../services/procurement/schemas.js";
import { requiredPermissionForTransition } from "../services/procurement/workflow.js";

export function createProcurementRouter({ authMiddleware, service, trustProxy }: { authMiddleware: RequestHandler; service: ProcurementService; trustProxy: boolean }) {
  const router = Router(); const sameOrigin = createRequireSameOrigin({ trustProxy });
  router.use("/api/procurements", authMiddleware, requireLogin, requirePasswordChanged);
  const actor = (request: Parameters<RequestHandler>[0]) => ({ id: request.authUser!.id, permissions: request.authUser!.permissions });
  const handle = (response: Parameters<RequestHandler>[1], next: Parameters<RequestHandler>[2], error: unknown) => {
    if (error instanceof ZodError) response.status(400).json({ error: "Validation failed", issues: error.issues });
    else if (error instanceof ProcurementAccessError) response.status(403).json({ error: error.message });
    else if (error instanceof ProcurementNotFoundError) response.status(404).json({ error: error.message });
    else if (error instanceof ProcurementConflictError) response.status(409).json({ error: error.message });
    else next(error);
  };
  router.get("/api/procurements/catalog", async (request, response, next) => { try { const query = catalogQuerySchema.parse(request.query); if (query.includeInactive && !request.authUser!.permissions.includes("procurements.purchase")) throw new ProcurementAccessError("Permission denied"); response.json(await service.listCatalog(query, actor(request))); } catch (error) { handle(response, next, error); } });
  router.post("/api/procurements/catalog/categories", sameOrigin, async (request, response, next) => { try { if (!request.authUser!.permissions.includes("procurements.purchase")) throw new ProcurementAccessError("Permission denied"); response.json(await service.createCatalogCategory(catalogCategorySchema.parse(request.body), actor(request))); } catch (error) { handle(response, next, error); } });
  router.put("/api/procurements/catalog/categories/:id", sameOrigin, async (request, response, next) => { try { if (!request.authUser!.permissions.includes("procurements.purchase")) throw new ProcurementAccessError("Permission denied"); response.json(await service.updateCatalogCategory(procurementIdSchema.parse(request.params.id), catalogCategorySchema.parse(request.body), actor(request))); } catch (error) { handle(response, next, error); } });
  router.post("/api/procurements/catalog/items", sameOrigin, async (request, response, next) => { try { if (!request.authUser!.permissions.includes("procurements.purchase")) throw new ProcurementAccessError("Permission denied"); response.json(await service.createCatalogItem(catalogItemSchema.parse(request.body), actor(request))); } catch (error) { handle(response, next, error); } });
  router.put("/api/procurements/catalog/items/:id", sameOrigin, async (request, response, next) => { try { if (!request.authUser!.permissions.includes("procurements.purchase")) throw new ProcurementAccessError("Permission denied"); response.json(await service.updateCatalogItem(procurementIdSchema.parse(request.params.id), catalogItemSchema.parse(request.body), actor(request))); } catch (error) { handle(response, next, error); } });
  router.get("/api/procurements", async (request, response, next) => { try {
    const query = procurementListQuerySchema.parse(request.query);
    const permissions = request.authUser!.permissions;
    if (query.scope === "all" && !permissions.includes("procurements.read_all")) throw new ProcurementAccessError("Permission denied");
    if (query.scope === "mine" && !permissions.includes("procurements.read_own") && !permissions.includes("procurements.read_all")) throw new ProcurementAccessError("Permission denied");
    response.json(await service.listRequests(actor(request), query.scope, query.status));
  } catch (error) { handle(response, next, error); } });
  router.get("/api/procurements/:id", async (request, response, next) => { try { response.json(await service.getRequest(procurementIdSchema.parse(request.params.id), actor(request))); } catch (error) { handle(response, next, error); } });
  router.post("/api/procurements", sameOrigin, async (request, response, next) => { try { if (!request.authUser!.permissions.includes("procurements.create")) throw new ProcurementAccessError("Permission denied"); response.json(await service.createRequest(createProcurementSchema.parse(request.body), request.authUser!.id)); } catch (error) { handle(response, next, error); } });
  router.post("/api/procurements/:id/transition", sameOrigin, async (request, response, next) => { try { const body = transitionSchema.parse(request.body); if (body.action !== "cancel" && !request.authUser!.permissions.includes(requiredPermissionForTransition(body.action))) throw new ProcurementAccessError("Permission denied"); response.json(await service.transition(procurementIdSchema.parse(request.params.id), body, actor(request))); } catch (error) { handle(response, next, error); } });
  router.post("/api/procurements/:id/comments", sameOrigin, async (request, response, next) => { try { const body = commentSchema.parse(request.body); response.json(await service.addComment(procurementIdSchema.parse(request.params.id), body.body, actor(request))); } catch (error) { handle(response, next, error); } });
  return router;
}
