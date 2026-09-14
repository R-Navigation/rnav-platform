import { Router, type RequestHandler } from "express";
import { ZodError } from "zod";
import { requireLogin } from "../middleware/auth.js";
import { requirePasswordChanged } from "../middleware/requirePasswordChanged.js";
import { createRequireSameOrigin } from "../middleware/requireSameOrigin.js";
import { ProfileAssetError, ProfileConflictError, ProfilePublicNameError, type ProfileService } from "../services/account/profileService.js";
import { profileUpdateSchema } from "../services/account/profileSchemas.js";

export function createProfileRouter({ authMiddleware, service, trustProxy }: { authMiddleware: RequestHandler; service: ProfileService; trustProxy: boolean }) {
  const router = Router();
  router.use("/api/profile", authMiddleware, requireLogin, requirePasswordChanged);
  router.get("/api/profile", async (request, response, next) => { try { const profile = await service.getProfile(request.authUser!.id); profile ? response.json(profile) : response.status(404).json({ error: "Profile not found" }); } catch (error) { next(error); } });
  router.put("/api/profile", createRequireSameOrigin({ trustProxy }), async (request, response, next) => { try { response.json(await service.updateProfile(request.authUser!.id, profileUpdateSchema.parse(request.body))); } catch (error) {
    if (error instanceof ZodError) response.status(400).json({ code: "VALIDATION_ERROR", error: "Validation failed", issues: error.issues });
    else if (error instanceof ProfileConflictError) response.status(409).json({ code: "VERSION_CONFLICT", error: error.message });
    else if (error instanceof ProfileAssetError) response.status(400).json({ code: "AVATAR_INVALID", error: error.message });
    else if (error instanceof ProfilePublicNameError) response.status(400).json({ code: "PUBLIC_NAME_REQUIRED", error: error.message });
    else next(error);
  } });
  return router;
}
