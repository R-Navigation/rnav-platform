import type { Pool, PoolClient } from "pg";
import type { AdminProfileUpdate, ProfileUpdate } from "./profileSchemas.js";
import { profileCompleteness } from "./profileCompleteness.js";

export class ProfileConflictError extends Error {
  constructor() { super("Profile version conflict"); this.name = "ProfileConflictError"; }
}

export class ProfileAssetError extends Error {
  constructor() { super("头像资源不存在或不是有效图片"); this.name = "ProfileAssetError"; }
}

export class ProfilePublicNameError extends Error {
  constructor() { super("官网展示至少需要公开一个已填写的姓名"); this.name = "ProfilePublicNameError"; }
}

type ProfileRow = {
  user_id: string; username: string; member_slug: string | null;
  member_status: "current" | "alumni"; degree_level: string; public_visible: boolean;
  name_zh: string; name_en: string; email: string; phone: string;
  bio_zh: string; bio_en: string; research_interests_zh: string; research_interests_en: string;
  enrollment_year: string; graduation_year: string; major_zh: string; major_en: string;
  thesis_zh: string; thesis_en: string; destination_zh: string; destination_en: string;
  avatar_asset_id: string | null; avatar_url: string | null; personal_links: unknown;
  avatar_position_x: number; avatar_position_y: number; avatar_zoom: string;
  public_fields: string[]; version: string;
  account_email?: string | null; profile_content_updated_at?: Date; updated_at?: Date;
};

function output(row: ProfileRow) {
  return {
    userId: row.user_id, username: row.username,
    memberSlug: row.member_slug, memberStatus: row.member_status, academicStage: row.degree_level,
    publicVisible: row.public_visible, nameZh: row.name_zh, nameEn: row.name_en, publicEmail: row.email,
    phone: row.phone, bioZh: row.bio_zh, bioEn: row.bio_en,
    researchInterestsZh: row.research_interests_zh, researchInterestsEn: row.research_interests_en,
    enrollmentYear: row.enrollment_year, graduationYear: row.graduation_year,
    majorZh: row.major_zh, majorEn: row.major_en, thesisZh: row.thesis_zh, thesisEn: row.thesis_en,
    destinationZh: row.destination_zh, destinationEn: row.destination_en,
    avatarAssetId: row.avatar_asset_id, avatarUrl: row.avatar_url,
    avatarPositionX: row.avatar_position_x, avatarPositionY: row.avatar_position_y, avatarZoom: Number(row.avatar_zoom),
    personalLinks: Array.isArray(row.personal_links) ? row.personal_links : [],
    publicFields: row.public_fields, version: Number(row.version), accountEmail: row.account_email ?? "",
    updatedAt: row.updated_at ?? null, profileContentUpdatedAt: row.profile_content_updated_at ?? row.updated_at ?? null,
    completeness: profileCompleteness({ memberStatus: row.member_status, publicVisible: row.public_visible, publicFields: row.public_fields,
      nameZh: row.name_zh, nameEn: row.name_en, avatarAssetId: row.avatar_asset_id, academicStage: row.degree_level,
      enrollmentYear: row.enrollment_year, graduationYear: row.graduation_year, majorZh: row.major_zh, majorEn: row.major_en,
      researchInterestsZh: row.research_interests_zh, researchInterestsEn: row.research_interests_en,
      destinationZh: row.destination_zh, destinationEn: row.destination_en }),
  };
}

const selectProfile = `SELECT user_profiles.*, users.username, users.email AS account_email, media_assets.url AS avatar_url
  FROM user_profiles JOIN users ON users.id = user_profiles.user_id
  LEFT JOIN media_assets ON media_assets.id = user_profiles.avatar_asset_id AND media_assets.status = 'active'
  WHERE user_profiles.user_id = $1`;

async function recycleUnreferencedAvatar(client: PoolClient, assetId: string | null) {
  if (!assetId) return;
  await client.query(`UPDATE media_assets SET status='recycled',recycled_at=now(),updated_at=now()
    WHERE id=$1 AND status='active'
      AND NOT EXISTS (SELECT 1 FROM user_profiles WHERE avatar_asset_id=$1)
      AND NOT EXISTS (SELECT 1 FROM research_items WHERE image_asset_id=$1 OR pdf_asset_id=$1)
      AND NOT EXISTS (SELECT 1 FROM news_items WHERE image_asset_id=$1)
      AND NOT EXISTS (SELECT 1 FROM facility_items WHERE image_asset_id=$1)
      AND NOT EXISTS (SELECT 1 FROM procurement_catalog_items WHERE image_asset_id=$1)
      AND NOT EXISTS (SELECT 1 FROM page_content WHERE content_json::text LIKE '%' || $1::text || '%')`, [assetId]);
}

export function createProfileService(pool: Pick<Pool, "query" | "connect">) {
  async function updateProfileInternal(targetUserId: string, actorUserId: string, body: ProfileUpdate | AdminProfileUpdate, admin: boolean) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<ProfileRow>(`SELECT user_profiles.*,users.username,users.email AS account_email,NULL::text avatar_url FROM user_profiles JOIN users ON users.id=user_profiles.user_id WHERE user_profiles.user_id=$1 FOR UPDATE OF user_profiles`, [targetUserId]);
      if (!current.rows[0]) throw new ProfileConflictError();
      if (body.avatarAssetId) {
        const asset = await client.query("SELECT 1 FROM media_assets WHERE id=$1 AND status='active' AND mime_type LIKE 'image/%'", [body.avatarAssetId]);
        if (!asset.rowCount) throw new ProfileAssetError();
      }
      const before = output(current.rows[0]) as Record<string, unknown>;
      const memberStatus = admin ? (body as AdminProfileUpdate).memberStatus : current.rows[0].member_status;
      const academicStage = admin ? (body as AdminProfileUpdate).academicStage : current.rows[0].degree_level;
      const publicVisible = admin ? (body as AdminProfileUpdate).publicVisible : current.rows[0].public_visible;
      if (publicVisible && !(
        (body.nameZh.trim() && body.publicFields.includes("name_zh"))
        || (body.nameEn.trim() && body.publicFields.includes("name_en"))
      )) throw new ProfilePublicNameError();
      const updated = await client.query(
        `UPDATE user_profiles SET member_status=$3,degree_level=$4,name_zh=$5,name_en=$6,email=$7,phone=$8,bio_zh=$9,bio_en=$10,
           research_interests_zh=$11,research_interests_en=$12,enrollment_year=$13,graduation_year=$14,
           major_zh=$15,major_en=$16,thesis_zh=$17,thesis_en=$18,destination_zh=$19,destination_en=$20,
           avatar_asset_id=$21,avatar_position_x=$22,avatar_position_y=$23,avatar_zoom=$24,
           personal_links=$25::jsonb,public_fields=$26,public_visible=$27,version=version+1,
           profile_content_updated_at=now(),updated_at=now()
         WHERE user_id=$1 AND version=$2`,
        [targetUserId, body.version, memberStatus, academicStage, body.nameZh, body.nameEn, body.publicEmail, body.phone, body.bioZh, body.bioEn,
          body.researchInterestsZh, body.researchInterestsEn, body.enrollmentYear, body.graduationYear,
          body.majorZh, body.majorEn, body.thesisZh, body.thesisEn, body.destinationZh, body.destinationEn,
          body.avatarAssetId, body.avatarPositionX, body.avatarPositionY, body.avatarZoom,
          JSON.stringify(body.personalLinks), body.publicFields, publicVisible]
      );
      if (!updated.rowCount) throw new ProfileConflictError();
      await client.query("UPDATE users SET display_name=COALESCE(NULLIF($2,''),NULLIF($3,''),username),updated_at=now() WHERE id=$1", [targetUserId, body.nameZh, body.nameEn]);
      await recycleUnreferencedAvatar(client, current.rows[0].avatar_asset_id === body.avatarAssetId ? null : current.rows[0].avatar_asset_id);
      const after = { ...body, memberStatus, academicStage, publicVisible } as Record<string, unknown>;
      const changedFields = Object.keys(after).filter((key) => key !== "version" && JSON.stringify(before[key]) !== JSON.stringify(after[key]));
      await client.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,$2,'user',$3::text,$4::jsonb)",
        [actorUserId, admin ? "profile.admin_update" : "profile.update", targetUserId, JSON.stringify({ changedFields })]);
      const result = await client.query<ProfileRow>(selectProfile, [targetUserId]);
      await client.query("COMMIT");
      return output(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }
  return {
    async getProfile(userId: string) {
      const result = await pool.query<ProfileRow>(selectProfile, [userId]);
      return result.rows[0] ? output(result.rows[0]) : null;
    },
    async updateProfile(userId: string, body: ProfileUpdate) {
      return updateProfileInternal(userId, userId, body, false);
    },
    async updateProfileAsAdmin(userId: string, actorUserId: string, body: AdminProfileUpdate) {
      return updateProfileInternal(userId, actorUserId, body, true);
    },
  };
}

export type ProfileService = ReturnType<typeof createProfileService>;
