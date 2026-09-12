import { Router, type RequestHandler } from "express";
import { requireLogin } from "../middleware/auth.js";
import { requirePasswordChanged } from "../middleware/requirePasswordChanged.js";
import type { ConsoleDashboardService } from "../services/console-dashboard/consoleDashboardService.js";
import {
  deriveDisplayTier,
  getConsoleModules
} from "../services/auth/permissions.js";

type ConsoleRouterOptions = {
  authMiddleware: RequestHandler;
  dashboardService: ConsoleDashboardService;
};

export function createConsoleRouter(options: ConsoleRouterOptions) {
  const router = Router();

  router.get(
    "/api/console/bootstrap",
    options.authMiddleware,
    requireLogin,
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
        consoleModules: user.mustChangePassword
          ? [{ key: "profile", href: "/console/profile?section=security", label: "账号安全" }]
          : getConsoleModules(user.permissions, user.baseTier)
      });
    }
  );

  router.get(
    "/api/console/dashboard",
    options.authMiddleware,
    requireLogin,
    requirePasswordChanged,
    async (request, response, next) => {
      try {
        response.json(await options.dashboardService.getDashboard(request.authUser!));
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
