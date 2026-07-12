import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { Router, json, type RequestHandler } from "express";
import { serialize } from "cookie";
import {
  hashSessionToken,
  normalizeAuthenticatedUser,
  requireLogin,
  sessionCookieName,
  type AuthRepository,
  type SessionIdentity
} from "../middleware/auth.js";
import { deriveDisplayTier } from "../services/auth/permissions.js";

// Legacy hashes may use different costs; this fixed policy only equalizes unknown-user work.
const invalidPasswordHash =
  "$2b$12$cHDtHdJCYXUnLog8oLhRWuxzsLi1wFgplo.q6tZvV1X2xObATr58e";
const defaultSessionTtlMs = 7 * 24 * 60 * 60 * 1000;

type AuthRouterOptions = {
  repository: AuthRepository;
  authMiddleware: RequestHandler;
  cookieSecure?: boolean;
  sessionTtlMs?: number;
  now?: () => Date;
};

function cookieOptions(secure: boolean, maxAge?: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge
  };
}

type CookieSecureResolution = {
  explicitValue?: boolean;
  envValue?: string;
  nodeEnv?: string;
};

export function resolveCookieSecure({
  explicitValue,
  envValue,
  nodeEnv
}: CookieSecureResolution) {
  if (explicitValue !== undefined) {
    return explicitValue;
  }
  if (envValue !== undefined) {
    if (envValue === "true") {
      return true;
    }
    if (envValue === "false") {
      return false;
    }
    throw new Error("COOKIE_SECURE must be true or false");
  }
  return nodeEnv === "production";
}

function safeSessionPayload(identity: SessionIdentity) {
  return {
    user: {
      id: identity.id,
      username: identity.username,
      displayName: identity.displayName,
      tier: deriveDisplayTier(identity.baseTier, identity.permissions)
    },
    permissions: identity.permissions
  };
}

async function compareLoginPassword(password: string, passwordHash?: string) {
  return bcrypt.compare(password, passwordHash ?? invalidPasswordHash);
}

export function createAuthRouter(options: AuthRouterOptions) {
  const router = Router();
  const sessionTtlMs = options.sessionTtlMs ?? defaultSessionTtlMs;
  const secure = resolveCookieSecure({
    explicitValue: options.cookieSecure,
    envValue: process.env.COOKIE_SECURE,
    nodeEnv: process.env.NODE_ENV
  });
  const now = options.now ?? (() => new Date());

  router.post("/api/auth/login", json(), async (request, response, next) => {
    try {
      const username =
        typeof request.body?.username === "string" ? request.body.username : "";
      const password =
        typeof request.body?.password === "string" ? request.body.password : "";
      const user = username
        ? await options.repository.findUserForLogin(username)
        : null;
      const passwordMatches = await compareLoginPassword(
        password,
        user?.passwordHash
      );

      if (!user || !passwordMatches || user.status !== "active") {
        response.status(401).json({ error: "Invalid username or password" });
        return;
      }

      const issuedAt = now();
      const expiresAt = new Date(issuedAt.getTime() + sessionTtlMs);
      const token = randomBytes(32).toString("base64url");
      const tokenHash = hashSessionToken(token);
      await options.repository.createSession({
        userId: user.id,
        tokenHash,
        expiresAt
      });
      await options.repository.updateLastLogin(user.id, issuedAt);
      const identity = await options.repository.findIdentityBySessionTokenHash(
        tokenHash,
        issuedAt
      );
      if (!identity) {
        throw new Error("Created session could not be loaded");
      }
      const authenticatedIdentity = normalizeAuthenticatedUser(identity);

      response.setHeader(
        "set-cookie",
        serialize(
          sessionCookieName,
          token,
          cookieOptions(secure, Math.floor(sessionTtlMs / 1000))
        )
      );
      response.json(safeSessionPayload(authenticatedIdentity));
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/api/auth/logout",
    options.authMiddleware,
    async (request, response, next) => {
      try {
        if (request.presentedSessionTokenHash) {
          await options.repository.revokeSession(
            request.presentedSessionTokenHash
          );
        }
        response.setHeader(
          "set-cookie",
          serialize(sessionCookieName, "", cookieOptions(secure, 0))
        );
        response.status(204).end();
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/api/auth/session",
    options.authMiddleware,
    requireLogin,
    (request, response) => {
      response.json(safeSessionPayload(request.authUser!));
    }
  );

  return router;
}
