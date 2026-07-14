import { Router, type RequestHandler } from "express";
import { requirePermission } from "../middleware/requirePermission.js";
import {
  deriveDisplayTier,
  getConsoleModules
} from "../services/auth/permissions.js";

type ConsoleRouterOptions = {
  authMiddleware: RequestHandler;
};

export function createConsoleRouter(options: ConsoleRouterOptions) {
  const router = Router();

  router.get(
    "/api/console/bootstrap",
    options.authMiddleware,
    requirePermission("console.access"),
    (request, response) => {
      const user = request.authUser!;
      response.json({
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          tier: deriveDisplayTier(user.baseTier, user.permissions),
          mustChangePassword: user.mustChangePassword ?? false
        },
        permissions: user.permissions,
        consoleModules: getConsoleModules(user.permissions, user.baseTier)
      });
    }
  );

  return router;
}
