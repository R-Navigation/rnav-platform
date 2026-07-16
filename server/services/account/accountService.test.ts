import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import { createAccountService, CurrentPasswordError, PasswordValidationError } from "./accountService.js";

class Client {
  calls: Array<{ sql: string; values?: unknown[] }> = [];
  released = false;
  passwordHash = bcrypt.hashSync("OldPassword1!", 4);
  async query(sql: string, values?: unknown[]) {
    this.calls.push({ sql, values });
    if (sql.includes("SELECT password_hash")) return { rowCount: 1, rows: [{ password_hash: this.passwordHash }] };
    if (sql.includes("DELETE FROM session_tokens")) return { rowCount: 2, rows: [] };
    return { rowCount: 1, rows: [] };
  }
  release() { this.released = true; }
}

test("change password updates the hash, clears first login, revokes other sessions, and audits", async () => {
  const client = new Client();
  const service = createAccountService({ connect: async () => client } as never);
  await service.changePassword({
    userId: "user-1",
    currentPassword: "OldPassword1!",
    newPassword: "abcdefgh",
    currentSessionTokenHash: "current-hash"
  });

  const update = client.calls.find((call) => call.sql.includes("UPDATE users"));
  assert.ok(update);
  assert.notEqual(update.values?.[1], "abcdefgh");
  assert.equal(await bcrypt.compare("abcdefgh", String(update.values?.[1])), true);
  assert.match(update.sql, /must_change_password = false/);
  assert.ok(client.calls.some((call) => call.sql.includes("token_hash <> $2")));
  const audit = client.calls.find((call) => call.sql.includes("INSERT INTO audit_logs"));
  assert.match(audit?.sql ?? "", /\$2::text/);
  assert.equal(JSON.stringify(audit).includes("abcdefgh"), false);
  assert.equal(client.calls.at(-1)?.sql, "COMMIT");
  assert.equal(client.released, true);
});

test("change password rejects policy failures before opening a transaction", async () => {
  const service = createAccountService({ connect: async () => { throw new Error("unused"); } } as never);
  await assert.rejects(
    service.changePassword({ userId: "u", currentPassword: "old", newPassword: "weak", currentSessionTokenHash: "s" }),
    PasswordValidationError
  );
});

test("change password rolls back for an incorrect current password", async () => {
  const client = new Client();
  const service = createAccountService({ connect: async () => client } as never);
  await assert.rejects(
    service.changePassword({ userId: "u", currentPassword: "WrongPassword1!", newPassword: "NewPassword2@", currentSessionTokenHash: "s" }),
    CurrentPasswordError
  );
  assert.equal(client.calls.at(-1)?.sql, "ROLLBACK");
});
