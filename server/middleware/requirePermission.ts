import type { RequestHandler } from "express";
import { requirePasswordChanged } from "./requirePasswordChanged.js";

export function requirePermission(permission: string): RequestHandler {
  return (request, response, next) => {
    if (!request.authUser) {
      response.status(401).json({ error: "Authentication required" });
      return;
    }

    if (request.authUser.mustChangePassword) return requirePasswordChanged(request, response, next);

    if (!request.authUser.permissions.includes(permission)) {
      response.status(403).json({ error: "Permission denied" });
      return;
    }

    next();
  };
}
