import { Router, type RequestHandler } from "express";
import { ZodError } from "zod";
import { requireLogin } from "../middleware/auth.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { createRequireSameOrigin } from "../middleware/requireSameOrigin.js";
import {
  createUserSchema,
  accountEmailSchema,
  accountKindSchema,
  adminProfileUpdateSchema,
  convertAlumniSchema,
  importUsersSchema,
  publicProfileAdminSchema,
  statusSchema,
  tierSchema,
  userIdSchema,
  userListSchema,
} from "../services/user-admin/userSchemas.js";
import {
  UserAdminError,
  type UserAdminService,
} from "../services/user-admin/userAdminService.js";
import { ProfileAssetError, ProfileConflictError, type ProfileService } from "../services/account/profileService.js";
export function createUsersRouter({
  authMiddleware,
  service,
  profileService,
  trustProxy,
}: {
  authMiddleware: RequestHandler;
  service: UserAdminService;
  profileService?: ProfileService;
  trustProxy: boolean;
}) {
  const router = Router(),
    same = createRequireSameOrigin({ trustProxy });
  router.use("/api/users", authMiddleware, requireLogin);
  const actor = (r: any) => ({
    id: r.authUser.id,
    baseTier: r.authUser.baseTier,
  });
  const handle = (e: unknown, res: any, next: any) => {
    if (e instanceof ZodError)
      res.status(400).json({
        code: "VALIDATION_ERROR",
        error: "Validation failed",
        issues: e.issues,
      });
    else if (e instanceof UserAdminError)
      res.status(e.status).json({ code: e.code, error: e.message });
    else if (e instanceof ProfileConflictError) res.status(409).json({ code: "VERSION_CONFLICT", error: e.message });
    else if (e instanceof ProfileAssetError) res.status(400).json({ code: "AVATAR_INVALID", error: e.message });
    else next(e);
  };
  const canList: RequestHandler = (req, res, next) =>
    req.authUser?.permissions.some(
      (p) => p === "users.read" || p === "users.write" || p === "permissions.write" || p === "site.members.write",
    )
      ? next()
      : res.status(403).json({ error: "Permission denied" });
  router.get("/api/users", canList, async (r, res, next) => {
    try {
      res.json({
        users: await service.listUsers(userListSchema.parse(r.query)),
      });
    } catch (e) {
      handle(e, res, next);
    }
  });
  router.get("/api/users/:id/audit", canList, async (r, res, next) => {
    try {
      res.json({
        audit: await service.getUserAudit(userIdSchema.parse(r.params.id)),
      });
    } catch (e) {
      handle(e, res, next);
    }
  });
  router.get(
    "/api/users/:id/deletion-check",
    requirePermission("users.write"),
    async (r, res, next) => {
      try {
        res.json(
          await service.getDeletionCheck(
            userIdSchema.parse(r.params.id),
            actor(r),
          ),
        );
      } catch (e) {
        handle(e, res, next);
      }
    },
  );
  router.get("/api/users/:id/profile", requirePermission("site.members.write"), async (r, res, next) => {
    try { if (!profileService) throw new Error("Profile service unavailable"); const profile = await profileService.getProfile(userIdSchema.parse(r.params.id)); profile ? res.json(profile) : res.status(404).json({ error: "Profile not found" }); }
    catch (e) { handle(e, res, next); }
  });
  router.put("/api/users/:id/profile", requirePermission("site.members.write"), same, async (r, res, next) => {
    try { if (!profileService) throw new Error("Profile service unavailable"); res.json(await profileService.updateProfileAsAdmin(userIdSchema.parse(r.params.id), actor(r).id, adminProfileUpdateSchema.parse(r.body))); }
    catch (e) { handle(e, res, next); }
  });
  router.post(
    "/api/users",
    requirePermission("users.write"),
    same,
    async (r, res, next) => {
      try {
        res
          .status(201)
          .json(
            await service.createUser(createUserSchema.parse(r.body), actor(r)),
          );
      } catch (e) {
        handle(e, res, next);
      }
    },
  );
  router.put("/api/users/:id/account-email", requirePermission("users.write"), same, async (r, res, next) => {
    try { await service.setAccountEmail(userIdSchema.parse(r.params.id), accountEmailSchema.parse(r.body).email, actor(r)); res.status(204).end(); }
    catch (e) { handle(e, res, next); }
  });
  router.put("/api/users/:id/account-kind", requirePermission("users.write"), same, async (r, res, next) => {
    try { await service.setAccountKind(userIdSchema.parse(r.params.id),accountKindSchema.parse(r.body).accountKind,actor(r));res.status(204).end(); }
    catch(e){handle(e,res,next);}
  });
  router.post("/api/users/:id/convert-alumni", requirePermission("site.members.write"), same, async (r, res, next) => {
    try { convertAlumniSchema.parse(r.body); res.json(await service.convertToAlumni(userIdSchema.parse(r.params.id), actor(r))); }
    catch (e) { handle(e, res, next); }
  });
  router.post("/api/users/import", requirePermission("users.write"), same, async (r, res, next) => {
    try { res.status(201).json(await service.importUsers(importUsersSchema.parse(r.body), actor(r))); }
    catch (e) { handle(e, res, next); }
  });
  router.post("/api/users/import/validate", requirePermission("users.write"), same, async (r, res, next) => {
    try { res.json(await service.validateImportUsers(importUsersSchema.parse(r.body), actor(r))); }
    catch (e) { handle(e, res, next); }
  });
  router.put(
    "/api/users/:id/status",
    requirePermission("users.write"),
    same,
    async (r, res, next) => {
      try {
        await service.setStatus(
          userIdSchema.parse(r.params.id),
          statusSchema.parse(r.body).status,
          actor(r),
        );
        res.status(204).end();
      } catch (e) {
        handle(e, res, next);
      }
    },
  );
  router.put(
    "/api/users/:id/tier",
    requirePermission("users.write"),
    same,
    async (r, res, next) => {
      try {
        await service.setTier(
          userIdSchema.parse(r.params.id),
          tierSchema.parse(r.body).baseTier,
          actor(r),
        );
        res.status(204).end();
      } catch (e) {
        handle(e, res, next);
      }
    },
  );
  router.put(
    "/api/users/:id/public-profile",
    requirePermission("users.write"),
    same,
    async (r, res, next) => {
      try {
        await service.setPublicProfile(
          userIdSchema.parse(r.params.id),
          publicProfileAdminSchema.parse(r.body),
          actor(r),
        );
        res.status(204).end();
      } catch (e) {
        handle(e, res, next);
      }
    },
  );
  router.post(
    "/api/users/:id/reset-password",
    requirePermission("users.write"),
    same,
    async (r, res, next) => {
      try {
        res.json(
          await service.resetPassword(
            userIdSchema.parse(r.params.id),
            actor(r),
          ),
        );
      } catch (e) {
        handle(e, res, next);
      }
    },
  );
  router.post(
    "/api/users/:id/revoke-sessions",
    requirePermission("users.write"),
    same,
    async (r, res, next) => {
      try {
        res.json(
          await service.revokeSessions(
            userIdSchema.parse(r.params.id),
            actor(r),
          ),
        );
      } catch (e) {
        handle(e, res, next);
      }
    },
  );
  router.delete(
    "/api/users/:id",
    requirePermission("users.write"),
    same,
    async (r, res, next) => {
      try {
        res.json(
          await service.deleteUser(userIdSchema.parse(r.params.id), actor(r)),
        );
      } catch (e) {
        handle(e, res, next);
      }
    },
  );
  return router;
}
