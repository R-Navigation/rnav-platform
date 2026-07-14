import { createHash } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Pool } from "pg";
import { parse } from "cookie";
import {
  getEffectivePermissions,
  resolvePermissions,
  type BaseTier
} from "../services/auth/permissions.js";

export const sessionCookieName = "rnav_session";

export type UserStatus = "active" | "disabled" | "invited";

export type UserForLogin = {
  id: string;
  username: string;
  displayName: string;
  baseTier: BaseTier;
  status: UserStatus;
  passwordHash: string;
  mustChangePassword: boolean;
};

export type SessionIdentity = Omit<
  UserForLogin,
  "passwordHash" | "status" | "mustChangePassword"
> & {
  mustChangePassword?: boolean;
  permissions: string[];
};

export type AuthenticatedUser = SessionIdentity;

export interface AuthRepository {
  findUserForLogin(username: string): Promise<UserForLogin | null>;
  createSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  updateLastLogin(userId: string, at: Date): Promise<void>;
  findIdentityBySessionTokenHash(
    tokenHash: string,
    now: Date
  ): Promise<SessionIdentity | null>;
  revokeSession(tokenHash: string): Promise<void>;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser;
      presentedSessionTokenHash?: string;
    }
  }
}

type UserRow = {
  id: string;
  username: string;
  display_name: string;
  base_tier: BaseTier;
  status: UserStatus;
  password_hash: string;
  must_change_password: boolean;
};

type IdentityRow = Omit<UserRow, "password_hash"> & {
  template_permissions: string[] | null;
  explicit_grants: string[] | null;
  explicit_revokes: string[] | null;
};

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function normalizeAuthenticatedUser(
  identity: SessionIdentity
): AuthenticatedUser {
  return {
    ...identity,
    mustChangePassword: identity.mustChangePassword ?? false,
    permissions: getEffectivePermissions(identity.permissions, identity.baseTier)
  };
}

export function getSessionToken(request: Request) {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) {
    return null;
  }

  try {
    const token = parse(cookieHeader)[sessionCookieName];
    return typeof token === "string" && token.trim().length > 0 ? token : null;
  } catch {
    return null;
  }
}

export function createPostgresAuthRepository(pool: Pool): AuthRepository {
  return {
    async findUserForLogin(username) {
      const result = await pool.query<UserRow>(
        `SELECT id, username, display_name, base_tier, status, password_hash,
                must_change_password
         FROM users
         WHERE username = $1`,
        [username]
      );
      const row = result.rows[0];
      return row
        ? {
            id: row.id,
            username: row.username,
            displayName: row.display_name,
            baseTier: row.base_tier,
            status: row.status,
            passwordHash: row.password_hash,
            mustChangePassword: row.must_change_password
          }
        : null;
    },

    async createSession({ userId, tokenHash, expiresAt }) {
      await pool.query(
        `INSERT INTO session_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [userId, tokenHash, expiresAt]
      );
    },

    async updateLastLogin(userId, at) {
      await pool.query(
        `UPDATE users
         SET last_login_at = $2, updated_at = $2
         WHERE id = $1`,
        [userId, at]
      );
    },

    async findIdentityBySessionTokenHash(tokenHash, now) {
      const result = await pool.query<IdentityRow>(
        `SELECT
           users.id,
           users.username,
           users.display_name,
           users.base_tier,
           users.status,
           users.must_change_password,
           COALESCE(
             (SELECT array_agg(DISTINCT permission_template_permissions.permission_key)
              FROM user_permission_templates
              JOIN permission_template_permissions
                ON permission_template_permissions.template_key = user_permission_templates.template_key
              WHERE user_permission_templates.user_id = users.id),
             ARRAY[]::text[]
           ) AS template_permissions,
           COALESCE(
             (SELECT array_agg(user_permission_overrides.permission_key)
              FROM user_permission_overrides
              WHERE user_permission_overrides.user_id = users.id
                AND user_permission_overrides.decision = 'grant'),
             ARRAY[]::text[]
           ) AS explicit_grants,
           COALESCE(
             (SELECT array_agg(user_permission_overrides.permission_key)
              FROM user_permission_overrides
              WHERE user_permission_overrides.user_id = users.id
                AND user_permission_overrides.decision = 'revoke'),
             ARRAY[]::text[]
           ) AS explicit_revokes
         FROM session_tokens
         JOIN users ON users.id = session_tokens.user_id
         WHERE session_tokens.token_hash = $1
           AND session_tokens.expires_at > $2
           AND users.status = 'active'`,
        [tokenHash, now]
      );
      const row = result.rows[0];
      const resolution = row
        ? resolvePermissions({
            baseTier: row.base_tier,
            templatePermissions: (row.template_permissions ?? []).map(
              (permissionKey) => ({ permissionKey, templateKey: "assigned" })
            ),
            explicitGrants: row.explicit_grants ?? [],
            explicitRevokes: row.explicit_revokes ?? []
          })
        : null;
      return row
        ? {
            id: row.id,
            username: row.username,
            displayName: row.display_name,
            baseTier: row.base_tier,
            mustChangePassword: row.must_change_password,
            permissions: resolution?.permissions ?? []
          }
        : null;
    },

    async revokeSession(tokenHash) {
      await pool.query("DELETE FROM session_tokens WHERE token_hash = $1", [
        tokenHash
      ]);
    }
  };
}

export function createAuthMiddleware(repository: AuthRepository): RequestHandler {
  return async (request, response, next) => {
    try {
      const token = getSessionToken(request);
      if (!token) {
        next();
        return;
      }

      const tokenHash = hashSessionToken(token);
      request.presentedSessionTokenHash = tokenHash;
      const identity = await repository.findIdentityBySessionTokenHash(
        tokenHash,
        new Date()
      );
      if (identity) {
        request.authUser = normalizeAuthenticatedUser(identity);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireLogin(
  request: Request,
  response: Response,
  next: NextFunction
) {
  if (!request.authUser) {
    response.status(401).json({ error: "Authentication required" });
    return;
  }

  next();
}
