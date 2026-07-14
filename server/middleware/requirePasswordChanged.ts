import type { RequestHandler } from "express";

export const requirePasswordChanged: RequestHandler = (request, response, next) => {
  if (request.authUser?.mustChangePassword) {
    response.status(403).json({
      code: "PASSWORD_CHANGE_REQUIRED",
      error: "Password change required"
    });
    return;
  }
  next();
};
