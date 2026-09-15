import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { SettingsError } from "./settingsService.js";

const OPENALEX_SECRET_KEY = "scholarly.openalex_api_key";
const CACHE_TTL_MS = 2_000;

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;
type RuntimeFallbacks = { enabled: boolean; crossrefContactEmail?: string; openAlexApiKey?: string };
type SettingsRow = { enabled: boolean; crossref_contact_email: string | null; version: string; updated_at: string };
type SecretRow = { ciphertext: Buffer; nonce: Buffer; auth_tag: Buffer; version: string; updated_at: string };

export type ScholarlyRuntimeConfig = {
  enabled: boolean;
  crossrefContactEmail?: string;
  openAlexApiKey?: string;
  version: number;
  updatedAt: string | null;
  source: "database" | "environment";
  secretVersion: number;
};

export type ScholarlyMemberSetting = {
  userId: string; username: string; memberName: string; orcidId: string | null; openalexAuthorId: string | null;
  identityStatus: "unconfigured" | "pending" | "verified" | "conflict";
  syncEnabled: boolean; syncFromYear: number | null; syncToYear: number | null; newWorkPolicy: "auto" | "review";
  autoEligible: boolean; autoDisabledReason: string | null; syncDisabledReason: string | null;
};

function encryptionKey(keyMaterial: string) {
  return createHash("sha256").update("rnav-system-secrets-v1\0").update(keyMaterial).digest();
}

export function encryptSecret(value: string, keyMaterial: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(keyMaterial), nonce);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { ciphertext, nonce, authTag: cipher.getAuthTag() };
}

export function decryptSecret(row: Pick<SecretRow, "ciphertext" | "nonce" | "auth_tag">, keyMaterial: string) {
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(keyMaterial), row.nonce);
    decipher.setAuthTag(row.auth_tag);
    return Buffer.concat([decipher.update(row.ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new SettingsError("OpenAlex Secret 无法解密，请重新配置 API Key", "SECRET_DECRYPTION_FAILED", 500);
  }
}

export function maskSecret(value?: string) {
  if (!value) return null;
  return value.length > 4 ? `••••••••${value.slice(-4)}` : "••••••••";
}

function year(value: unknown) { return value == null ? null : Number(value); }
export function automaticPolicyEligibility(member: Pick<ScholarlyMemberSetting, "identityStatus" | "syncFromYear" | "syncToYear">) {
  if (member.identityStatus !== "verified") return "需先完成 OpenAlex 身份验证";
  if (!Number.isInteger(member.syncFromYear) || !Number.isInteger(member.syncToYear)) return "需先设置完整的同步起止年份";
  if (member.syncFromYear! > member.syncToYear!) return "同步起始年份不能晚于结束年份";
  return null;
}

const memberSelect = `SELECT users.id user_id,users.username,users.display_name,
  profiles.name_zh,profiles.name_en,profiles.degree_level,profiles.member_status,
  scholarly.orcid_id,scholarly.openalex_author_id,COALESCE(scholarly.identity_status,'unconfigured') identity_status,
  COALESCE(scholarly.sync_enabled,false) sync_enabled,
  COALESCE(scholarly.sync_from_year,CASE WHEN profiles.degree_level IN ('phd','master','undergrad') AND profiles.enrollment_year ~ '^\\d{4}$' THEN profiles.enrollment_year::int END) sync_from_year,
  COALESCE(scholarly.sync_to_year,CASE WHEN profiles.member_status='alumni' AND profiles.graduation_year ~ '^\\d{4}$' THEN profiles.graduation_year::int END) sync_to_year,
  COALESCE(scholarly.new_work_policy,'review') new_work_policy
  FROM users LEFT JOIN user_profiles profiles ON profiles.user_id=users.id
  LEFT JOIN member_scholarly_profiles scholarly ON scholarly.user_id=users.id`;

function mapMember(row: Record<string, unknown>): ScholarlyMemberSetting {
  const member: ScholarlyMemberSetting = {
    userId: String(row.user_id), username: String(row.username), memberName: String(row.name_zh || row.name_en || row.display_name || row.username),
    orcidId: row.orcid_id ? String(row.orcid_id) : null, openalexAuthorId: row.openalex_author_id ? String(row.openalex_author_id) : null,
    identityStatus: String(row.identity_status ?? "unconfigured") as ScholarlyMemberSetting["identityStatus"],
    syncEnabled: Boolean(row.sync_enabled), syncFromYear: year(row.sync_from_year), syncToYear: year(row.sync_to_year),
    newWorkPolicy: String(row.new_work_policy ?? "review") as ScholarlyMemberSetting["newWorkPolicy"],
    autoEligible: false, autoDisabledReason: null, syncDisabledReason: null,
  };
  member.autoDisabledReason = automaticPolicyEligibility(member);
  member.autoEligible = !member.autoDisabledReason;
  member.syncDisabledReason = member.identityStatus === "verified" ? null : "需先完成 OpenAlex 身份验证";
  return member;
}

async function readMember(queryable: Queryable, userId: string) {
  const result = await queryable.query<Record<string, unknown>>(`${memberSelect} WHERE users.account_kind='person' AND users.id=$1`, [userId]);
  return result.rows[0] ? mapMember(result.rows[0]) : null;
}

export function createScholarlySyncSettingsService(pool: Pick<Pool, "query" | "connect">, options: { encryptionSecret: string; fallbacks: RuntimeFallbacks }) {
  let cached: { expiresAt: number; value: ScholarlyRuntimeConfig } | null = null;
  const invalidate = () => { cached = null; };

  async function getRuntimeConfig(force = false): Promise<ScholarlyRuntimeConfig> {
    if (!force && cached && cached.expiresAt > Date.now()) return cached.value;
    const [settings, secret] = await Promise.all([
      pool.query<SettingsRow>("SELECT enabled,crossref_contact_email,version::text,updated_at FROM scholarly_sync_settings WHERE singleton=1"),
      pool.query<SecretRow>("SELECT ciphertext,nonce,auth_tag,version::text,updated_at FROM system_secrets WHERE key=$1", [OPENALEX_SECRET_KEY]),
    ]);
    const setting = settings.rows[0]; const storedSecret = secret.rows[0];
    const value: ScholarlyRuntimeConfig = {
      enabled: setting ? Boolean(setting.enabled) : options.fallbacks.enabled,
      crossrefContactEmail: setting ? (setting.crossref_contact_email || undefined) : options.fallbacks.crossrefContactEmail,
      openAlexApiKey: storedSecret ? decryptSecret(storedSecret, options.encryptionSecret) : options.fallbacks.openAlexApiKey,
      version: setting ? Number(setting.version) : 0,
      updatedAt: setting?.updated_at ?? null,
      source: setting ? "database" : "environment",
      secretVersion: storedSecret ? Number(storedSecret.version) : 0,
    };
    cached = { expiresAt: Date.now() + CACHE_TTL_MS, value };
    return value;
  }

  async function listMembers(queryable: Queryable = pool) {
    const result = await queryable.query<Record<string, unknown>>(`${memberSelect} WHERE users.account_kind='person' ORDER BY COALESCE(NULLIF(profiles.name_zh,''),NULLIF(profiles.name_en,''),users.display_name,users.username),users.id`);
    return result.rows.map(mapMember);
  }

  async function getOverview() {
    const [runtime, members, scheduled] = await Promise.all([
      getRuntimeConfig(), listMembers(),
      pool.query<Record<string, unknown>>("SELECT id,status,started_at,finished_at,members_checked,works_seen,candidates_created,works_updated,failures FROM scholarly_sync_runs WHERE trigger_type='scheduled' ORDER BY started_at DESC LIMIT 1"),
    ]);
    return {
      settings: {
        enabled: runtime.enabled, crossrefContactEmail: runtime.crossrefContactEmail ?? "", version: runtime.version,
        updatedAt: runtime.updatedAt, source: runtime.source,
        openAlexApiKey: { configured: Boolean(runtime.openAlexApiKey), masked: maskSecret(runtime.openAlexApiKey), version: runtime.secretVersion },
      },
      members,
      lastScheduledRun: scheduled.rows[0] ?? null,
    };
  }

  async function updateGlobal(input: { enabled: boolean; crossrefContactEmail: string | null; version: number; openAlexApiKey?: string }, actorId: string) {
    const client = await pool.connect(); const keyChanged = Boolean(input.openAlexApiKey?.trim());
    try {
      await client.query("BEGIN");
      const current = await client.query<SettingsRow>("SELECT enabled,crossref_contact_email,version::text,updated_at FROM scholarly_sync_settings WHERE singleton=1 FOR UPDATE");
      const currentVersion = current.rows[0] ? Number(current.rows[0].version) : 0;
      if (currentVersion !== input.version) throw new SettingsError("设置已被其他管理员更新，请重新加载", "SETTING_CONFLICT", 409);
      if (current.rows[0]) {
        await client.query("UPDATE scholarly_sync_settings SET enabled=$1,crossref_contact_email=$2,version=version+1,updated_by=$3,updated_at=now() WHERE singleton=1", [input.enabled, input.crossrefContactEmail || null, actorId]);
      } else {
        await client.query("INSERT INTO scholarly_sync_settings(singleton,enabled,crossref_contact_email,updated_by) VALUES(1,$1,$2,$3)", [input.enabled, input.crossrefContactEmail || null, actorId]);
      }
      if (keyChanged) {
        const encrypted = encryptSecret(input.openAlexApiKey!.trim(), options.encryptionSecret);
        await client.query(
          `INSERT INTO system_secrets(key,ciphertext,nonce,auth_tag,updated_by) VALUES($1,$2,$3,$4,$5)
           ON CONFLICT(key) DO UPDATE SET ciphertext=EXCLUDED.ciphertext,nonce=EXCLUDED.nonce,auth_tag=EXCLUDED.auth_tag,
           version=system_secrets.version+1,updated_by=EXCLUDED.updated_by,updated_at=now()`,
          [OPENALEX_SECRET_KEY, encrypted.ciphertext, encrypted.nonce, encrypted.authTag, actorId],
        );
      }
      await client.query(
        "INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,'scholarly.settings.update','scholarly_sync_settings','global',$2::jsonb)",
        [actorId, JSON.stringify({ enabled: input.enabled, crossrefContactConfigured: Boolean(input.crossrefContactEmail), openAlexKeyChanged: keyChanged })],
      );
      await client.query("COMMIT"); invalidate();
      return { keyChanged };
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  async function updateMember(userId: string, input: { syncEnabled?: boolean; newWorkPolicy?: "auto" | "review" }, actorId: string) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await readMember(client, userId);
      if (!current) throw new SettingsError("成员不存在", "MEMBER_NOT_FOUND", 404);
      const syncEnabled = input.syncEnabled ?? current.syncEnabled;
      const newWorkPolicy = input.newWorkPolicy ?? current.newWorkPolicy;
      if (syncEnabled && current.identityStatus !== "verified") throw new SettingsError("请先完成 OpenAlex 身份验证再启用同步", "IDENTITY_NOT_VERIFIED");
      if (newWorkPolicy === "auto") {
        const reason = automaticPolicyEligibility(current);
        if (reason) throw new SettingsError(reason, "AUTO_POLICY_NOT_ALLOWED");
      }
      await client.query(
        `INSERT INTO member_scholarly_profiles(user_id,identity_status,sync_enabled,new_work_policy)
         VALUES($1,$2,$3,$4)
         ON CONFLICT(user_id) DO UPDATE SET sync_enabled=EXCLUDED.sync_enabled,new_work_policy=EXCLUDED.new_work_policy,updated_at=now()`,
        [userId, current.identityStatus, syncEnabled, newWorkPolicy],
      );
      await client.query(
        "INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,'scholarly.settings.member.update','member_scholarly_profile',$2,$3::jsonb)",
        [actorId, userId, JSON.stringify({ syncEnabled, newWorkPolicy, source: "settings" })],
      );
      const saved = await readMember(client, userId);
      await client.query("COMMIT"); return saved!;
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  async function bulkMembers(operation: "enable_sync" | "review_all", actorId: string) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const people = await client.query<{ count: number }>("SELECT count(*)::int count FROM users WHERE account_kind='person'");
      const requested = people.rows[0]?.count ?? 0;
      let eligible = requested; let updated = 0;
      if (operation === "enable_sync") {
        const verified = await client.query<{ count: number }>("SELECT count(*)::int count FROM member_scholarly_profiles profile JOIN users ON users.id=profile.user_id WHERE users.account_kind='person' AND profile.identity_status='verified'");
        eligible = verified.rows[0]?.count ?? 0;
        const result = await client.query("UPDATE member_scholarly_profiles profile SET sync_enabled=true,updated_at=now() FROM users WHERE users.id=profile.user_id AND users.account_kind='person' AND profile.identity_status='verified' AND profile.sync_enabled IS DISTINCT FROM true");
        updated = result.rowCount ?? 0;
      } else {
        const result = await client.query("UPDATE member_scholarly_profiles profile SET new_work_policy='review',updated_at=now() FROM users WHERE users.id=profile.user_id AND users.account_kind='person' AND profile.new_work_policy IS DISTINCT FROM 'review'");
        updated = result.rowCount ?? 0;
      }
      const result = { operation, requested, eligible, updated, unchanged: Math.max(0, eligible - updated), skipped: Math.max(0, requested - eligible) };
      await client.query(
        "INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,'scholarly.settings.members.bulk','member_scholarly_profile','batch',$2::jsonb)",
        [actorId, JSON.stringify(result)],
      );
      await client.query("COMMIT"); return result;
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  return { getRuntimeConfig, getOverview, updateGlobal, updateMember, bulkMembers, invalidate };
}

export type ScholarlySyncSettingsService = ReturnType<typeof createScholarlySyncSettingsService>;
