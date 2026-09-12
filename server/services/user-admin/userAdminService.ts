import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Pool } from "pg";
import {
  deriveDisplayTier,
  resolvePermissions,
  type BaseTier,
} from "../auth/permissions.js";
import type { z } from "zod";
import type { createUserSchema } from "./userSchemas.js";
import type { importUsersSchema } from "./userSchemas.js";
import { profileCompleteness } from "../account/profileCompleteness.js";

export class UserAdminError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "UserAdminError";
  }
}
type Actor = { id: string; baseTier: BaseTier };
const SUPER_LOCK = 724866120014;
function temporaryPassword() {
  return `Rnav!${randomBytes(9).toString("base64url")}9aA`;
}
function slug(username: string) {
  return username
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function createUserAdminService(pool: Pick<Pool, "query" | "connect">) {
  return {
    async listUsers(query: {
      search?: string;
      status?: string;
      tier?: string;
      publicVisibility?: string; profile?: string; login?: string; memberStatus?: string;
    }) {
      const result = await pool.query<any>(
        `SELECT users.id,users.username,users.email,users.display_name,users.base_tier,users.account_kind,users.status,
        users.must_change_password,users.last_login_at,users.created_at,
        user_profiles.public_visible,user_profiles.member_status,user_profiles.member_category,user_profiles.degree_level,
        user_profiles.name_zh,user_profiles.name_en,user_profiles.email public_email,user_profiles.phone,user_profiles.bio_zh,user_profiles.bio_en,
        user_profiles.research_interests_zh,user_profiles.research_interests_en,user_profiles.enrollment_year,user_profiles.graduation_year,
        user_profiles.major_zh,user_profiles.major_en,user_profiles.thesis_zh,user_profiles.thesis_en,user_profiles.destination_zh,user_profiles.destination_en,
        user_profiles.avatar_asset_id,media_assets.url avatar_url,user_profiles.avatar_position_x,user_profiles.avatar_position_y,user_profiles.avatar_zoom,
        user_profiles.personal_links,user_profiles.public_fields,user_profiles.version,user_profiles.profile_content_updated_at,user_profiles.homepage_url,
        COALESCE(array_agg(DISTINCT permission_template_permissions.permission_key) FILTER(WHERE permission_template_permissions.permission_key IS NOT NULL),ARRAY[]::text[]) template_permissions,
        COALESCE(array_agg(DISTINCT user_permission_templates.template_key) FILTER(WHERE user_permission_templates.template_key IS NOT NULL),ARRAY[]::text[]) template_keys,
        COALESCE(array_agg(DISTINCT user_permission_overrides.permission_key) FILTER(WHERE user_permission_overrides.decision='grant'),ARRAY[]::text[]) grants,
        COALESCE(array_agg(DISTINCT user_permission_overrides.permission_key) FILTER(WHERE user_permission_overrides.decision='revoke'),ARRAY[]::text[]) revokes
        FROM users JOIN user_profiles ON user_profiles.user_id=users.id LEFT JOIN media_assets ON media_assets.id=user_profiles.avatar_asset_id LEFT JOIN user_permission_templates ON user_permission_templates.user_id=users.id
        LEFT JOIN permission_template_permissions ON permission_template_permissions.template_key=user_permission_templates.template_key
        LEFT JOIN user_permission_overrides ON user_permission_overrides.user_id=users.id
        WHERE ($1='' OR users.username ILIKE '%'||$1||'%' OR users.display_name ILIKE '%'||$1||'%' OR COALESCE(users.email,'') ILIKE '%'||$1||'%')
          AND ($2='' OR users.status=$2) GROUP BY users.id,user_profiles.user_id,media_assets.id ORDER BY users.status,users.username`,
        [query.search ?? "", query.status ?? ""],
      );
      return result.rows
        .map((row: any) => {
          const permissions = resolvePermissions({
            baseTier: row.base_tier,
            explicitGrants: [...row.template_permissions, ...row.grants],
            explicitRevokes: row.revokes,
          }).permissions;
          return {
            id: row.id,
            username: row.username,
            email: row.email ?? "",
            displayName: row.display_name,
            baseTier: row.base_tier,
            accountKind: row.account_kind,
            tier: deriveDisplayTier(row.base_tier, permissions),
            status: row.status,
            mustChangePassword: row.must_change_password,
            lastLoginAt: row.last_login_at,
            createdAt: row.created_at,
            publicVisible: row.public_visible,
            memberStatus: row.member_status,
            memberCategory: row.member_category,
            degreeLevel: row.degree_level,
            nameZh: row.name_zh,
            nameEn: row.name_en,
            researchInterestsZh: row.research_interests_zh,
            homepageUrl: row.homepage_url,
            templateKeys: row.template_keys,
            publicEmail: row.public_email, phone: row.phone, bioZh: row.bio_zh, bioEn: row.bio_en,
            researchInterestsEn: row.research_interests_en, enrollmentYear: row.enrollment_year, graduationYear: row.graduation_year,
            majorZh: row.major_zh, majorEn: row.major_en, thesisZh: row.thesis_zh, thesisEn: row.thesis_en,
            destinationZh: row.destination_zh, destinationEn: row.destination_en, avatarAssetId: row.avatar_asset_id, avatarUrl: row.avatar_url,
            avatarPositionX: row.avatar_position_x, avatarPositionY: row.avatar_position_y, avatarZoom: Number(row.avatar_zoom),
            personalLinks: row.personal_links, publicFields: row.public_fields, version: Number(row.version),
            profileContentUpdatedAt: row.profile_content_updated_at,
            completeness: profileCompleteness({ memberStatus: row.member_status, publicVisible: row.public_visible, nameZh: row.name_zh,
              nameEn: row.name_en, avatarAssetId: row.avatar_asset_id, degreeLevel: row.degree_level, enrollmentYear: row.enrollment_year,
              graduationYear: row.graduation_year, majorZh: row.major_zh, majorEn: row.major_en,
              researchInterestsZh: row.research_interests_zh, researchInterestsEn: row.research_interests_en,
              destinationZh: row.destination_zh, destinationEn: row.destination_en }),
          };
        })
        .filter((user: any) => !query.tier || user.tier === query.tier)
        .filter((user: any) => !query.publicVisibility || (query.publicVisibility === "public") === user.publicVisible)
        .filter((user: any) => !query.memberStatus || query.memberStatus === user.memberStatus)
        .filter((user: any) => !query.profile || (query.profile === "complete" ? user.completeness.complete : query.profile === "incomplete" ? !user.completeness.complete : Date.now() - new Date(user.profileContentUpdatedAt).getTime() > 365 * 86400000))
        .filter((user: any) => !query.login || (query.login === "never" ? !user.lastLoginAt : query.login === "active" ? user.lastLoginAt && Date.now() - new Date(user.lastLoginAt).getTime() <= 180 * 86400000 : user.lastLoginAt && Date.now() - new Date(user.lastLoginAt).getTime() > 180 * 86400000));
    },
    async getUserAudit(userId: string) {
      const result = await pool.query<any>(
        `SELECT audit.id,audit.action,audit.detail,audit.created_at,
        COALESCE(actor.display_name,actor.username,'系统') actor_name
        FROM audit_logs audit LEFT JOIN users actor ON actor.id=audit.actor_id
        WHERE audit.target_type='user' AND audit.target_id=$1
        ORDER BY audit.created_at DESC LIMIT 100`,
        [userId],
      );
      return result.rows.map((row: any) => ({
        id: row.id,
        action: row.action,
        detail: row.detail ?? {},
        createdAt: row.created_at,
        actorName: row.actor_name,
      }));
    },
    async createUser(body: z.input<typeof createUserSchema>, actor: Actor) {
      if (body.baseTier === "super" && actor.baseTier !== "super")
        throw new UserAdminError(
          "Only super can create super users",
          "SUPER_REQUIRED",
          403,
        );
      const password = temporaryPassword();
      const hash = await bcrypt.hash(password, 12);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock($1)", [SUPER_LOCK]);
        const user = await client.query<{ id: string }>(
          `INSERT INTO users(username,email,password_hash,base_tier,account_kind,display_name,status,must_change_password,created_source)
          VALUES($1,$2,$3,$4,$5,$6,'active',true,'admin') RETURNING id`,
          [
            body.username,
            body.email,
            hash,
            body.baseTier,
            body.accountKind ?? "person",
            body.nameZh || body.nameEn,
          ],
        );
        const id = user.rows[0].id;
        const memberStatus =
          body.memberCategory === "alumni" ? "alumni" : "current";
        const degreeLevel =
          body.memberCategory === "advisor"
            ? "faculty"
            : body.memberCategory === "alumni"
              ? "master"
              : body.memberCategory;
        await client.query(
          `INSERT INTO user_profiles(user_id,member_slug,member_category,member_status,degree_level,name_zh,name_en,email,public_visible)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,false)`,
          [
            id,
            slug(body.username),
            body.memberCategory,
            memberStatus,
            degreeLevel,
            body.nameZh,
            body.nameEn,
            body.email,
          ],
        );
        await client.query(
          "INSERT INTO user_permission_templates(user_id,template_key,assigned_by) VALUES($1,'normal-member',$2) ON CONFLICT DO NOTHING",
          [id, actor.id],
        );
        await client.query(
          "INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,'user.create','user',$2,$3::jsonb)",
          [
            actor.id,
            id,
            JSON.stringify({
              username: body.username,
              baseTier: body.baseTier,
              accountKind: body.accountKind ?? "person",
            }),
          ],
        );
        await client.query("COMMIT");
        return { id, temporaryPassword: password };
      } catch (error: any) {
        await client.query("ROLLBACK");
        if (error?.code === "23505")
          throw new UserAdminError(
            "Username, email, or member slug already exists",
            "USER_CONFLICT",
            409,
          );
        throw error;
      } finally {
        client.release();
      }
    },
    async setStatus(
      userId: string,
      status: "active" | "disabled",
      actor: Actor,
    ) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock($1)", [SUPER_LOCK]);
        const target = await client.query<{
          base_tier: BaseTier;
          status: string;
        }>("SELECT base_tier,status FROM users WHERE id=$1 FOR UPDATE", [
          userId,
        ]);
        if (!target.rows[0])
          throw new UserAdminError("User not found", "NOT_FOUND", 404);
        if (userId === actor.id && status === "disabled")
          throw new UserAdminError(
            "Cannot disable yourself",
            "SELF_DISABLE",
            409,
          );
        if (target.rows[0].base_tier === "super" && actor.baseTier !== "super")
          throw new UserAdminError(
            "Only super can modify super users",
            "SUPER_REQUIRED",
            403,
          );
        if (target.rows[0].base_tier === "super" && status === "disabled") {
          const count = await client.query<{ count: string }>(
            "SELECT count(*)::text count FROM users WHERE base_tier='super' AND status='active'",
            [],
          );
          if (Number(count.rows[0].count) <= 1)
            throw new UserAdminError(
              "At least one active super is required",
              "LAST_SUPER",
              409,
            );
        }
        await client.query(
          "UPDATE users SET status=$2,updated_at=now() WHERE id=$1",
          [userId, status],
        );
        if (status === "disabled")
          await client.query("DELETE FROM session_tokens WHERE user_id=$1", [
            userId,
          ]);
        await client.query(
          "INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,'user.status','user',$2,$3::jsonb)",
          [actor.id, userId, JSON.stringify({ status })],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async setTier(userId: string, baseTier: BaseTier, actor: Actor) {
      if (actor.baseTier !== "super")
        throw new UserAdminError(
          "Only super can change super tier",
          "SUPER_REQUIRED",
          403,
        );
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock($1)", [SUPER_LOCK]);
        const target = await client.query<{
          base_tier: BaseTier;
          status: string;
        }>("SELECT base_tier,status FROM users WHERE id=$1 FOR UPDATE", [
          userId,
        ]);
        if (!target.rows[0])
          throw new UserAdminError("User not found", "NOT_FOUND", 404);
        if (
          target.rows[0].base_tier === "super" &&
          baseTier === "normal" &&
          target.rows[0].status === "active"
        ) {
          const count = await client.query<{ count: string }>(
            "SELECT count(*)::text count FROM users WHERE base_tier='super' AND status='active'",
          );
          if (Number(count.rows[0].count) <= 1)
            throw new UserAdminError(
              "At least one active super is required",
              "LAST_SUPER",
              409,
            );
        }
        await client.query(
          "UPDATE users SET base_tier=$2,updated_at=now() WHERE id=$1",
          [userId, baseTier],
        );
        await client.query("DELETE FROM session_tokens WHERE user_id=$1", [
          userId,
        ]);
        await client.query(
          "INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,'user.tier','user',$2,$3::jsonb)",
          [actor.id, userId, JSON.stringify({ baseTier })],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async setAccountKind(userId: string, accountKind: "person" | "system", actor: Actor) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const target = await client.query<{base_tier:BaseTier}>("SELECT base_tier FROM users WHERE id=$1 FOR UPDATE",[userId]);
        if(!target.rowCount) throw new UserAdminError("User not found","NOT_FOUND",404);
        if(target.rows[0].base_tier==="super"&&actor.baseTier!=="super") throw new UserAdminError("Only super can modify super users","SUPER_REQUIRED",403);
        await client.query("UPDATE users SET account_kind=$2,updated_at=now() WHERE id=$1",[userId,accountKind]);
        if(accountKind==="system") await client.query("UPDATE user_profiles SET public_visible=false,updated_at=now() WHERE user_id=$1",[userId]);
        await client.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,'user.account_kind','user',$2,$3::jsonb)",[actor.id,userId,JSON.stringify({accountKind})]);
        await client.query("COMMIT");
      } catch(error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    },
    async setPublicProfile(
      userId: string,
      input: { publicVisible: boolean },
      actor: Actor,
    ) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query(
          "UPDATE user_profiles SET public_visible=$2,updated_at=now() WHERE user_id=$1",
          [userId, input.publicVisible],
        );
        if (!result.rowCount)
          throw new UserAdminError("User not found", "NOT_FOUND", 404);
        await client.query(
          "INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,'user.public_profile','user',$2,$3::jsonb)",
          [actor.id, userId, JSON.stringify(input)],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async resetPassword(userId: string, actor: Actor) {
      const password = temporaryPassword();
      const hash = await bcrypt.hash(password, 12);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const target = await client.query<{ base_tier: BaseTier }>(
          "SELECT base_tier FROM users WHERE id=$1 FOR UPDATE",
          [userId],
        );
        if (!target.rows[0])
          throw new UserAdminError("User not found", "NOT_FOUND", 404);
        if (target.rows[0].base_tier === "super" && actor.baseTier !== "super")
          throw new UserAdminError(
            "Only super can reset super passwords",
            "SUPER_REQUIRED",
            403,
          );
        await client.query(
          "UPDATE users SET password_hash=$2,must_change_password=true,password_changed_at=NULL,updated_at=now() WHERE id=$1",
          [userId, hash],
        );
        await client.query("DELETE FROM session_tokens WHERE user_id=$1", [
          userId,
        ]);
        await client.query(
          "INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,'user.password.reset','user',$2,'{}'::jsonb)",
          [actor.id, userId],
        );
        await client.query("COMMIT");
        return { temporaryPassword: password };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async revokeSessions(userId: string, actor: Actor) {
      const target = await pool.query<{ base_tier: BaseTier }>(
        "SELECT base_tier FROM users WHERE id=$1",
        [userId],
      );
      if (!target.rows[0])
        throw new UserAdminError("User not found", "NOT_FOUND", 404);
      if (target.rows[0].base_tier === "super" && actor.baseTier !== "super")
        throw new UserAdminError(
          "Only super can revoke super sessions",
          "SUPER_REQUIRED",
          403,
        );
      const result = await pool.query(
        "DELETE FROM session_tokens WHERE user_id=$1",
        [userId],
      );
      await pool.query(
        "INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,'user.sessions.revoke','user',$2,$3::jsonb)",
        [actor.id, userId, JSON.stringify({ count: result.rowCount ?? 0 })],
      );
      return { revoked: result.rowCount ?? 0 };
    },
    async setAccountEmail(userId: string, email: string, actor: Actor) {
      const target = await pool.query<{ base_tier: BaseTier }>("SELECT base_tier FROM users WHERE id=$1", [userId]);
      if (!target.rows[0]) throw new UserAdminError("User not found", "NOT_FOUND", 404);
      if (target.rows[0].base_tier === "super" && actor.baseTier !== "super") throw new UserAdminError("Only super can modify super users", "SUPER_REQUIRED", 403);
      try {
        await pool.query("UPDATE users SET email=$2,updated_at=now() WHERE id=$1", [userId, email]);
        await pool.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,'user.account_email','user',$2,$3::jsonb)", [actor.id, userId, JSON.stringify({ changed: true })]);
      } catch (error: any) {
        if (error?.code === "23505") throw new UserAdminError("Email already exists", "USER_CONFLICT", 409);
        throw error;
      }
    },
    async convertToAlumni(userId: string, actor: Actor) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const target = await client.query<{ base_tier: BaseTier; member_status: string }>(`SELECT users.base_tier,user_profiles.member_status FROM users JOIN user_profiles ON user_profiles.user_id=users.id WHERE users.id=$1 FOR UPDATE`, [userId]);
        if (!target.rows[0]) throw new UserAdminError("User not found", "NOT_FOUND", 404);
        if (target.rows[0].base_tier === "super") throw new UserAdminError("Super accounts cannot be converted to alumni", "SUPER_ACCOUNT_ALUMNI", 409);
        const assets = await client.query<{ code: string }>("SELECT code FROM lab_assets WHERE assigned_user_id=$1 AND status='in_use' FOR UPDATE", [userId]);
        if (assets.rowCount) throw new UserAdminError(`Member still has ${assets.rowCount} in-use asset(s)`, "ALUMNI_ASSETS_IN_USE", 409);
        const procurements = await client.query<{ count: string }>("SELECT count(*)::text count FROM procurement_requests WHERE requester_id=$1 AND status IN ('submitted','approved','purchasing','purchased')", [userId]);
        await client.query("UPDATE user_profiles SET member_status='alumni',member_category='alumni',profile_content_updated_at=now(),updated_at=now(),version=version+1 WHERE user_id=$1", [userId]);
        await client.query("DELETE FROM user_permission_templates WHERE user_id=$1", [userId]);
        await client.query("DELETE FROM user_permission_overrides WHERE user_id=$1", [userId]);
        await client.query("DELETE FROM session_tokens WHERE user_id=$1", [userId]);
        await client.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,'user.convert_alumni','user',$2,$3::jsonb)", [actor.id, userId, JSON.stringify({ openProcurements: Number(procurements.rows[0]?.count ?? 0) })]);
        await client.query("COMMIT");
        return { openProcurements: Number(procurements.rows[0]?.count ?? 0) };
      } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    },
    async validateImportUsers(body: z.output<typeof importUsersSchema>, actor: Actor) {
      const normalized=body.rows.map((row)=>({...row,username:row.username.toLowerCase(),email:row.email.toLowerCase()}));
      const existing=await pool.query<{username:string;email:string}>("SELECT username,COALESCE(email,'') email FROM users WHERE username=ANY($1::text[]) OR LOWER(COALESCE(email,''))=ANY($2::text[])",[normalized.map((row)=>row.username),normalized.map((row)=>row.email)]);
      const usernames=new Set(existing.rows.map((row)=>row.username));const emails=new Set(existing.rows.map((row)=>row.email.toLowerCase()));
      const rows=normalized.map((row,index)=>{const issues:string[]=[];if(normalized.findIndex((candidate)=>candidate.username===row.username)!==index)issues.push("文件内用户名重复");if(normalized.findIndex((candidate)=>candidate.email===row.email)!==index)issues.push("文件内登录邮箱重复");if(usernames.has(row.username))issues.push("用户名已存在");if(emails.has(row.email))issues.push("登录邮箱已存在");if(row.baseTier==="super"&&actor.baseTier!=="super")issues.push("无权导入超级管理员");return{index:index+1,username:row.username,issues};});
      return{valid:rows.every((row)=>!row.issues.length),summary:{total:rows.length,errors:rows.filter((row)=>row.issues.length).length},rows};
    },
    async importUsers(body: z.output<typeof importUsersSchema>, actor: Actor) {
      if (body.rows.some((row) => row.baseTier === "super") && actor.baseTier !== "super") throw new UserAdminError("Only super can import super users", "SUPER_REQUIRED", 403);
      const normalized = body.rows.map((row) => ({ ...row, username: row.username.toLowerCase(), email: row.email.toLowerCase() }));
      const duplicate = normalized.find((row, index) => normalized.findIndex((candidate) => candidate.username === row.username || candidate.email === row.email) !== index);
      if (duplicate) throw new UserAdminError("Import contains duplicate username or account email", "IMPORT_DUPLICATE", 409);
      const client = await pool.connect(); const credentials: Array<{ username: string; temporaryPassword: string }> = [];
      try {
        await client.query("BEGIN");
        for (const row of normalized) {
          const password = temporaryPassword(); const hash = await bcrypt.hash(password, 12);
          const user = await client.query<{ id: string }>(`INSERT INTO users(username,email,password_hash,base_tier,display_name,status,must_change_password,created_source) VALUES($1,$2,$3,$4,$5,'active',true,'import') RETURNING id`, [row.username, row.email, hash, row.baseTier, row.nameZh || row.nameEn]);
          const memberStatus = row.memberCategory === "alumni" ? "alumni" : "current";
          const degreeLevel = row.memberCategory === "advisor" ? "faculty" : row.memberCategory === "alumni" ? "master" : row.memberCategory;
          await client.query(`INSERT INTO user_profiles(user_id,member_slug,member_category,member_status,degree_level,name_zh,name_en,email,public_visible) VALUES($1,$2,$3,$4,$5,$6,$7,$8,false)`, [user.rows[0].id, slug(row.username), row.memberCategory, memberStatus, degreeLevel, row.nameZh, row.nameEn, row.publicEmail]);
          await client.query("INSERT INTO user_permission_templates(user_id,template_key,assigned_by) VALUES($1,'normal-member',$2) ON CONFLICT DO NOTHING", [user.rows[0].id, actor.id]);
          credentials.push({ username: row.username, temporaryPassword: password });
        }
        await client.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,'user.import','user_import',$1,$2::jsonb)", [actor.id, JSON.stringify({ count: normalized.length })]);
        await client.query("COMMIT"); return { imported: normalized.length, credentials };
      } catch (error: any) { await client.query("ROLLBACK"); if (error?.code === "23505") throw new UserAdminError("Username, email, or member slug already exists", "USER_CONFLICT", 409); throw error; } finally { client.release(); }
    },
  };
}
export type UserAdminService = ReturnType<typeof createUserAdminService>;
