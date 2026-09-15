import assert from "node:assert/strict";
import test from "node:test";
import { automaticPolicyEligibility, createScholarlySyncSettingsService, decryptSecret, encryptSecret, maskSecret } from "./scholarlySyncSettingsService.js";

test("OpenAlex secrets use authenticated encryption and expose only a mask", () => {
  const encrypted = encryptSecret("openalex-secret-1234", "session-secret");
  assert.equal(decryptSecret({ ciphertext: encrypted.ciphertext, nonce: encrypted.nonce, auth_tag: encrypted.authTag }, "session-secret"), "openalex-secret-1234");
  assert.equal(maskSecret("openalex-secret-1234"), "••••••••1234");
  assert.equal(maskSecret("tiny"), "••••••••");
  assert.throws(() => decryptSecret({ ciphertext: encrypted.ciphertext, nonce: encrypted.nonce, auth_tag: encrypted.authTag }, "wrong-secret"));
});

test("automatic acceptance requires verified identity and a complete valid year range", () => {
  assert.match(automaticPolicyEligibility({ identityStatus: "pending", syncFromYear: 2020, syncToYear: 2026 }) ?? "", /验证/);
  assert.match(automaticPolicyEligibility({ identityStatus: "verified", syncFromYear: 2020, syncToYear: null }) ?? "", /完整/);
  assert.match(automaticPolicyEligibility({ identityStatus: "verified", syncFromYear: 2027, syncToYear: 2026 }) ?? "", /不能晚于/);
  assert.equal(automaticPolicyEligibility({ identityStatus: "verified", syncFromYear: 2020, syncToYear: 2026 }), null);
});

test("runtime settings fall back to environment without returning a complete key in the overview", async () => {
  const pool = { query: async (sql: string) => {
    if (sql.includes("FROM scholarly_sync_settings")) return { rows: [] };
    if (sql.includes("FROM system_secrets")) return { rows: [] };
    if (sql.includes("FROM scholarly_sync_runs")) return { rows: [] };
    if (sql.includes("FROM users")) return { rows: [] };
    throw new Error(`Unexpected SQL: ${sql}`);
  } };
  const service = createScholarlySyncSettingsService(pool as never, { encryptionSecret: "session-secret", fallbacks: { enabled: true, openAlexApiKey: "environment-key-9876", crossrefContactEmail: "sync@example.org" } });
  assert.equal((await service.getRuntimeConfig()).openAlexApiKey, "environment-key-9876");
  const serialized = JSON.stringify(await service.getOverview());
  assert.doesNotMatch(serialized, /environment-key-9876/); assert.match(serialized, /••••••••9876/);
});

test("saving a new OpenAlex key writes ciphertext and a redacted audit event", async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const client = { query: async (sql: string, values?: unknown[]) => {
    calls.push({ sql, values });
    if (sql.includes("FROM scholarly_sync_settings") && sql.includes("FOR UPDATE")) return { rows: [], rowCount: 0 };
    return { rows: [], rowCount: 1 };
  }, release() {} };
  const service = createScholarlySyncSettingsService({ connect: async () => client } as never, { encryptionSecret: "session-secret", fallbacks: { enabled: false } });
  const result = await service.updateGlobal({ enabled: true, crossrefContactEmail: "sync@example.org", version: 0, openAlexApiKey: "brand-new-secret" }, "actor-1");
  assert.equal(result.keyChanged, true);
  assert.doesNotMatch(JSON.stringify(calls), /brand-new-secret/);
  const secretInsert = calls.find((call) => call.sql.includes("INSERT INTO system_secrets"));
  assert.ok(Buffer.isBuffer(secretInsert?.values?.[1]));
  const audit = calls.find((call) => call.sql.includes("scholarly.settings.update"));
  assert.match(String(audit?.values?.[1]), /"openAlexKeyChanged":true/);
});

test("bulk automatic sync only updates verified person profiles", async () => {
  const calls: string[] = [];
  const client = { query: async (sql: string) => {
    calls.push(sql);
    if (sql.includes("count(*)") && !sql.includes("identity_status")) return { rows: [{ count: 5 }], rowCount: 1 };
    if (sql.includes("count(*)") && sql.includes("identity_status")) return { rows: [{ count: 3 }], rowCount: 1 };
    if (sql.startsWith("UPDATE member_scholarly_profiles")) return { rows: [], rowCount: 2 };
    return { rows: [], rowCount: 1 };
  }, release() {} };
  const service = createScholarlySyncSettingsService({ connect: async () => client } as never, { encryptionSecret: "session-secret", fallbacks: { enabled: false } });
  const result = await service.bulkMembers("enable_sync", "actor-1");
  assert.deepEqual(result, { operation: "enable_sync", requested: 5, eligible: 3, updated: 2, unchanged: 1, skipped: 2 });
  assert.ok(calls.some((sql) => sql.includes("account_kind='person'") && sql.includes("identity_status='verified'") && sql.includes("sync_enabled=true")));
  assert.ok(calls.some((sql) => sql.includes("scholarly.settings.members.bulk")));
});
