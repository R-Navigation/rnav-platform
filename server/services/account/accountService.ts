import bcrypt from "bcryptjs";
import type { Pool } from "pg";
import { validatePasswordPolicy } from "./passwordPolicy.js";

export class PasswordValidationError extends Error {
  constructor(readonly issues: string[]) {
    super("Password does not meet policy");
    this.name = "PasswordValidationError";
  }
}

export class CurrentPasswordError extends Error {
  constructor() {
    super("Current password is incorrect");
    this.name = "CurrentPasswordError";
  }
}

export type AccountService = {
  changePassword(input: {
    userId: string;
    currentPassword: string;
    newPassword: string;
    currentSessionTokenHash: string;
  }): Promise<void>;
};

export function createAccountService(pool: Pick<Pool, "connect">): AccountService {
  return {
    async changePassword(input) {
      const policy = validatePasswordPolicy(input.newPassword);
      if (!policy.success) throw new PasswordValidationError(policy.issues);
      if (input.currentPassword === input.newPassword) {
        throw new PasswordValidationError(["新密码不能与当前密码相同"]);
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const userResult = await client.query<{ password_hash: string }>(
          "SELECT password_hash FROM users WHERE id = $1 AND status = 'active' FOR UPDATE",
          [input.userId]
        );
        const row = userResult.rows[0];
        if (!row || !(await bcrypt.compare(input.currentPassword, row.password_hash))) {
          throw new CurrentPasswordError();
        }

        const passwordHash = await bcrypt.hash(input.newPassword, 12);
        await client.query(
          `UPDATE users
           SET password_hash = $2,
               must_change_password = false,
               password_changed_at = now(),
               updated_at = now()
           WHERE id = $1`,
          [input.userId, passwordHash]
        );
        const revoked = await client.query(
          "DELETE FROM session_tokens WHERE user_id = $1 AND token_hash <> $2",
          [input.userId, input.currentSessionTokenHash]
        );
        await client.query(
          `INSERT INTO audit_logs (actor_id, action, target_type, target_id, detail)
           VALUES ($1, 'account.password.change', 'user', $1, $2::jsonb)`,
          [input.userId, JSON.stringify({ revokedSessions: revoked.rowCount ?? 0 })]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
  };
}
