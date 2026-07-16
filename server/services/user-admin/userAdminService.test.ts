import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import { createUserAdminService, UserAdminError } from "./userAdminService.js";

class Client {
  calls: Array<{ sql: string; values?: unknown[] }> = [];
  released = false;
  superCount = "1";
  async query(sql: string, values?: unknown[]) {
    this.calls.push({ sql, values });
    if (sql.includes("INSERT INTO users")) return { rowCount: 1, rows: [{ id: "user-2" }] };
    if (sql.includes("INSERT INTO team_members")) return { rowCount: 1, rows: [{ id: "22" }] };
    if (sql.includes("SELECT base_tier,status")) return { rowCount: 1, rows: [{ base_tier: "super", status: "active" }] };
    if (sql.includes("SELECT base_tier FROM")) return { rowCount: 1, rows: [{ base_tier: "normal" }] };
    if (sql.includes("count(*)")) return { rowCount: 1, rows: [{ count: this.superCount }] };
    return { rowCount: 1, rows: [] };
  }
  release() { this.released = true; }
}

test("user creation creates a private self-managed profile and returns a one-time password", async () => {
  const client = new Client(); const service = createUserAdminService({ connect: async () => client } as never);
  const result = await service.createUser({ username: "alice", nameZh: "张三", nameEn: "Alice", memberCategory: "phd", email: "a@example.com", baseTier: "normal" }, { id: "admin", baseTier: "super" });
  const insert = client.calls.find((call) => call.sql.includes("INSERT INTO users"));
  assert.equal(await bcrypt.compare(result.temporaryPassword, String(insert?.values?.[2])), true);
  assert.ok(client.calls.some((call) => call.sql.includes("INSERT INTO user_profiles")));
  assert.equal(client.calls.some((call) => call.sql.includes("INSERT INTO team_members")), false);
  assert.ok(client.calls.some((call) => call.sql.includes("public_visible")));
  assert.ok(client.calls.some((call) => call.sql.includes("normal-member")));
  assert.equal(JSON.stringify(client.calls).includes(result.temporaryPassword), false);
  assert.equal(client.calls.at(-1)?.sql, "COMMIT");
});

test("last active super and self disable are protected", async () => {
  const client = new Client(); const service = createUserAdminService({ connect: async () => client } as never);
  await assert.rejects(service.setStatus("admin", "disabled", { id: "admin", baseTier: "super" }), (error: unknown) => error instanceof UserAdminError && error.code === "SELF_DISABLE");
  await assert.rejects(service.setStatus("other-super", "disabled", { id: "admin", baseTier: "super" }), (error: unknown) => error instanceof UserAdminError && error.code === "LAST_SUPER");
  assert.ok(client.calls.some((call) => call.sql.includes("pg_advisory_xact_lock")));
});

test("password reset stores only a hash, requires first login change, and revokes sessions", async () => {
  const client = new Client(); const service = createUserAdminService({ connect: async () => client } as never);
  const result = await service.resetPassword("user-2", { id: "admin", baseTier: "super" });
  const update = client.calls.find((call) => call.sql.includes("UPDATE users SET password_hash"));
  assert.equal(await bcrypt.compare(result.temporaryPassword, String(update?.values?.[1])), true);
  assert.match(update?.sql ?? "", /must_change_password=true/);
  assert.ok(client.calls.some((call) => call.sql.includes("DELETE FROM session_tokens")));
});
