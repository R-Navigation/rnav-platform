import { createHash } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Pool } from "pg";
import { parse } from "cookie";
import type { BaseTier } from "../services/auth/permissions.js";

export const sessionCookieName = "rnav_session";

export type UserStatus = "active" | "disabled" | "invited";

export type UserForLogin = {
  id: string;
  username: string;
  displayName: string;
  baseTier: BaseTier;
  status: UserStatus;
  passwordHash: string;
};

export type SessionIdentity = Omit<UserForLogin, "passwordHash" | "status"> & {
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
      sessionTokenHash?: string;
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
};

type IdentityRow = Omit<UserRow, "password_hash"> & {
  permissions: string[] | null;
};

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getSessionToken(request: Request) {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) {
    return null;
  }

  return parse(cookieHeader)[sessionCookieName] ?? null;
}

export function createPostgresAuthRepository(pool: Pool): AuthRepository {
  return {
    async findUserForLogin(username) {
      const result = await pool.query<UserRow>(
        `SELECT id, username, display_name, base_tier, status, password_hash
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
            passwordHash: row.password_hash
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
           COALESCE(
             array_agg(user_permissions.permission_key)
               FILTER (WHERE user_permissions.permission_key IS NOT NULL),
             ARRAY[]::text[]
           ) AS permissions
         FROM session_tokens
         JOIN users ON users.id = session_tokens.user_id
         LEFT JOIN user_permissions ON user_permissions.user_id = users.id
         WHERE session_tokens.token_hash = $1
           AND session_tokens.expires_at > $2
           AND users.status = 'active'
         GROUP BY users.id, users.username, users.display_name, users.base_tier, users.status`,
        [tokenHash, now]
      );
      const row = result.rows[0];
      return row
        ? {
            id: row.id,
            username: row.username,
            displayName: row.display_name,
            baseTier: row.base_tier,
            permissions: row.permissions ?? []
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
      const identity = await repository.findIdentityBySessionTokenHash(
        tokenHash,
        new Date()
      );
      if (identity) {
        request.authUser = identity;
        request.sessionTokenHash = tokenHash;
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
