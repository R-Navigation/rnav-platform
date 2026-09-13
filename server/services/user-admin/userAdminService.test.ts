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

test("system account creation and conversion stay out of the public team",async()=>{const client=new Client();const service=createUserAdminService({connect:async()=>client} as never);await service.createUser({username:"robot",nameZh:"设备账号",nameEn:"Robot",email:"robot@example.com",baseTier:"normal",accountKind:"system"},{id:"admin",baseTier:"super"});const insert=client.calls.find((call)=>call.sql.includes("INSERT INTO users"));assert.equal(insert?.values?.[4],"system");await service.setAccountKind("user-2","system",{id:"admin",baseTier:"super"});assert.ok(client.calls.some((call)=>call.sql.includes("UPDATE user_profiles SET public_visible=false")));assert.ok(client.calls.some((call)=>call.sql.includes("'user.account_kind'")));});

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

class DeletionClient {
  calls: Array<{ sql: string; values?: unknown[] }> = [];
  released = false;
  target: Record<string, unknown> | null = {
    id: "00000000-0000-4000-8000-000000000002",
    username: "test-user",
    display_name: "Test User",
    account_kind: "person",
    base_tier: "normal",
    status: "disabled",
    last_login_at: null,
  };
  activeSuperCount = "2";
  dependencyCounts: Record<string, number> = {
    profile: 1,
    sessions: 2,
  };
  foreignKeyViolation = false;

  async query(sql: string, values?: unknown[]) {
    this.calls.push({ sql, values });
    if (sql.includes("SELECT id,username,display_name"))
      return { rowCount: this.target ? 1 : 0, rows: this.target ? [this.target] : [] };
    if (sql.includes("UNION ALL SELECT 'sessions'"))
      return {
        rowCount: Object.keys(this.dependencyCounts).length,
        rows: Object.entries(this.dependencyCounts).map(([type, count]) => ({ type, count })),
      };
    if (sql.includes("base_tier='super' AND status='active'"))
      return { rowCount: 1, rows: [{ count: this.activeSuperCount }] };
    if (sql === "DELETE FROM users WHERE id=$1" && this.foreignKeyViolation)
      throw Object.assign(new Error("foreign key violation"), { code: "23503" });
    return { rowCount: 1, rows: [] };
  }

  release() {
    this.released = true;
  }
}

const superActor = {
  id: "00000000-0000-4000-8000-000000000001",
  baseTier: "super" as const,
};

test("deletion check returns readable blocking and removable dependency counts", async () => {
  const client = new DeletionClient();
  client.dependencyCounts = {
    profile: 1,
    sessions: 2,
    procurement_requests: 3,
    asset_assignments: 1,
  };
  const service = createUserAdminService({
    query: client.query.bind(client),
    connect: async () => client,
  } as never);

  const result = await service.getDeletionCheck(
    String(client.target?.id),
    superActor,
  );
  assert.equal(result.deletable, false);
  assert.deepEqual(
    result.dependencies.map(({ label, count, blocking }) => ({
      label,
      count,
      blocking,
    })),
    [
      { label: "成员资料", count: 1, blocking: false },
      { label: "登录会话", count: 2, blocking: false },
      { label: "采购申请", count: 3, blocking: true },
      { label: "设备使用人关联", count: 1, blocking: true },
    ],
  );
});

test("only a super can run deletion checks or permanently delete", async () => {
  const client = new DeletionClient();
  const service = createUserAdminService({
    query: client.query.bind(client),
    connect: async () => client,
  } as never);
  const normalActor = { ...superActor, baseTier: "normal" as const };
  await assert.rejects(
    service.getDeletionCheck(String(client.target?.id), normalActor),
    (error: unknown) =>
      error instanceof UserAdminError &&
      error.code === "SUPER_REQUIRED" &&
      error.status === 403,
  );
  await assert.rejects(
    service.deleteUser(String(client.target?.id), normalActor),
    (error: unknown) =>
      error instanceof UserAdminError && error.code === "SUPER_REQUIRED",
  );
});

test("a deletable account revokes sessions, records audit, and deletes in one transaction", async () => {
  const client = new DeletionClient();
  const service = createUserAdminService({
    query: client.query.bind(client),
    connect: async () => client,
  } as never);
  const targetId = String(client.target?.id);
  const result = await service.deleteUser(targetId, superActor);

  assert.deepEqual(result, { deleted: true, id: targetId });
  const sessionIndex = client.calls.findIndex(
    ({ sql }) => sql === "DELETE FROM session_tokens WHERE user_id=$1",
  );
  const auditIndex = client.calls.findIndex(({ sql }) =>
    sql.includes("'user.delete'"),
  );
  const userIndex = client.calls.findIndex(
    ({ sql }) => sql === "DELETE FROM users WHERE id=$1",
  );
  assert.ok(sessionIndex > -1 && sessionIndex < auditIndex && auditIndex < userIndex);
  const audit = client.calls[auditIndex];
  assert.equal(audit.values?.[0], superActor.id);
  assert.equal(audit.values?.[1], targetId);
  assert.deepEqual(JSON.parse(String(audit.values?.[2])), {
    username: "test-user",
    displayName: "Test User",
    accountKind: "person",
    baseTier: "normal",
    reason: "permanent_delete",
  });
  assert.equal(client.calls.at(-1)?.sql, "COMMIT");
  assert.equal(client.released, true);
});

test("self deletion, the last active super, and business dependencies are rejected", async () => {
  const selfClient = new DeletionClient();
  selfClient.target = { ...selfClient.target, id: superActor.id };
  const selfService = createUserAdminService({ connect: async () => selfClient } as never);
  await assert.rejects(
    selfService.deleteUser(superActor.id, superActor),
    (error: unknown) =>
      error instanceof UserAdminError && error.code === "SELF_DELETE",
  );
  assert.equal(selfClient.calls.at(-1)?.sql, "ROLLBACK");

  const lastSuperClient = new DeletionClient();
  lastSuperClient.target = {
    ...lastSuperClient.target,
    base_tier: "super",
    status: "active",
  };
  lastSuperClient.activeSuperCount = "1";
  const lastSuperService = createUserAdminService({ connect: async () => lastSuperClient } as never);
  await assert.rejects(
    lastSuperService.deleteUser(String(lastSuperClient.target.id), superActor),
    (error: unknown) =>
      error instanceof UserAdminError && error.code === "LAST_SUPER",
  );

  const dependencyClient = new DeletionClient();
  dependencyClient.dependencyCounts.procurement_comments = 1;
  const dependencyService = createUserAdminService({ connect: async () => dependencyClient } as never);
  await assert.rejects(
    dependencyService.deleteUser(String(dependencyClient.target?.id), superActor),
    (error: unknown) =>
      error instanceof UserAdminError &&
      error.code === "USER_HAS_DEPENDENCIES",
  );
});

test("missing users return 404 and unexpected FK violations map to a safe 409", async () => {
  const missingClient = new DeletionClient();
  missingClient.target = null;
  const missingService = createUserAdminService({ connect: async () => missingClient } as never);
  await assert.rejects(
    missingService.deleteUser("00000000-0000-4000-8000-000000000099", superActor),
    (error: unknown) =>
      error instanceof UserAdminError && error.code === "NOT_FOUND",
  );

  const fkClient = new DeletionClient();
  fkClient.foreignKeyViolation = true;
  const fkService = createUserAdminService({ connect: async () => fkClient } as never);
  await assert.rejects(
    fkService.deleteUser(String(fkClient.target?.id), superActor),
    (error: unknown) =>
      error instanceof UserAdminError &&
      error.code === "USER_HAS_DEPENDENCIES" &&
      error.status === 409 &&
      !error.message.includes("foreign key"),
  );
  assert.equal(fkClient.calls.at(-1)?.sql, "ROLLBACK");
});

test("a deleted username and email can create a fresh account with a new UUID", async () => {
  const client = new DeletionClient();
  const oldId = String(client.target?.id);
  const service = createUserAdminService({ connect: async () => client } as never);
  await service.deleteUser(oldId, superActor);
  client.target = null;
  client.query = async function (sql: string, values?: unknown[]) {
    this.calls.push({ sql, values });
    if (sql.includes("INSERT INTO users"))
      return {
        rowCount: 1,
        rows: [{ id: "00000000-0000-4000-8000-000000000003" }],
      };
    return { rowCount: 1, rows: [] };
  };
  const recreated = await service.createUser(
    {
      username: "test-user",
      nameZh: "测试账号",
      nameEn: "Test User",
      memberCategory: "undergrad",
      email: "test-user@example.com",
      baseTier: "normal",
      accountKind: "person",
    },
    superActor,
  );
  assert.notEqual(recreated.id, oldId);
});
