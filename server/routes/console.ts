import { Router, type RequestHandler } from "express";
import { requireLogin } from "../middleware/auth.js";
import {
  deriveDisplayTier,
  getConsoleModules,
  getEffectivePermissions
} from "../services/auth/permissions.js";

type ConsoleRouterOptions = {
  authMiddleware: RequestHandler;
};

export function createConsoleRouter(options: ConsoleRouterOptions) {
  const router = Router();

  router.get(
    "/api/console/bootstrap",
    options.authMiddleware,
    requireLogin,
    (request, response) => {
      const user = request.authUser!;
      const permissions = getEffectivePermissions(user.permissions, user.baseTier);
      response.json({
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          tier: deriveDisplayTier(user.baseTier, permissions)
        },
        permissions,
        consoleModules: getConsoleModules(permissions, user.baseTier)
      });
    }
  );

  return router;
}
