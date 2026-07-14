import type { RequestHandler } from "express";

export function requirePermission(permission: string): RequestHandler {
  return (request, response, next) => {
    if (!request.authUser) {
      response.status(401).json({ error: "Authentication required" });
      return;
    }

    if (request.authUser.mustChangePassword) {
      response.status(403).json({
        code: "PASSWORD_CHANGE_REQUIRED",
        error: "Password change required"
      });
      return;
    }

    if (!request.authUser.permissions.includes(permission)) {
      response.status(403).json({ error: "Permission denied" });
      return;
    }

    next();
  };
}
