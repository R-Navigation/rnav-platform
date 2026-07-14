import type { Pool } from "pg";
import type { ProfileUpdate } from "./profileSchemas.js";

export class ProfileConflictError extends Error {
  constructor() { super("Profile version conflict"); this.name = "ProfileConflictError"; }
}

type ProfileRow = {
  user_id: string; username: string; member_category: string; member_slug: string | null;
  name_zh: string; name_en: string; title_zh: string; title_en: string; email: string; phone: string;
  bio_zh: string; bio_en: string; research_interests_zh: string; research_interests_en: string;
  homepage_url: string; github_url: string; avatar_asset_id: string | null; public_fields: string[]; version: string;
};

function output(row: ProfileRow) {
  return { userId: row.user_id, username: row.username, memberCategory: row.member_category, memberSlug: row.member_slug,
    nameZh: row.name_zh, nameEn: row.name_en, titleZh: row.title_zh, titleEn: row.title_en, email: row.email,
    phone: row.phone, bioZh: row.bio_zh, bioEn: row.bio_en, researchInterestsZh: row.research_interests_zh,
    researchInterestsEn: row.research_interests_en, homepageUrl: row.homepage_url, githubUrl: row.github_url,
    avatarAssetId: row.avatar_asset_id, publicFields: row.public_fields, version: Number(row.version) };
}

const selectProfile = `SELECT user_profiles.*, users.username
  FROM user_profiles JOIN users ON users.id = user_profiles.user_id WHERE user_profiles.user_id = $1`;

export function createProfileService(pool: Pick<Pool, "query" | "connect">) {
  return {
    async getProfile(userId: string) {
      const result = await pool.query<ProfileRow>(selectProfile, [userId]);
      return result.rows[0] ? output(result.rows[0]) : null;
    },
    async updateProfile(userId: string, body: ProfileUpdate) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const updated = await client.query<ProfileRow>(
          `UPDATE user_profiles SET name_zh=$3,name_en=$4,title_zh=$5,title_en=$6,email=$7,phone=$8,
             bio_zh=$9,bio_en=$10,research_interests_zh=$11,research_interests_en=$12,
             homepage_url=$13,github_url=$14,avatar_asset_id=$15,public_fields=$16,version=version+1,updated_at=now()
           WHERE user_id=$1 AND version=$2 RETURNING *`,
          [userId, body.version, body.nameZh, body.nameEn, body.titleZh, body.titleEn, body.email, body.phone,
            body.bioZh, body.bioEn, body.researchInterestsZh, body.researchInterestsEn, body.homepageUrl,
            body.githubUrl, body.avatarAssetId, body.publicFields]
        );
        if (!updated.rowCount) throw new ProfileConflictError();
        const row = updated.rows[0];
        const fields = new Set(body.publicFields);
        const asset = body.avatarAssetId && fields.has("avatar")
          ? await client.query<{ url: string }>("SELECT url FROM media_assets WHERE id=$1", [body.avatarAssetId]) : { rows: [] };
        const member = await client.query<{ team_member_id: string | null; member_slug: string | null }>(
          "SELECT team_member_id, member_slug FROM user_profiles WHERE user_id=$1", [userId]
        );
        const link = member.rows[0];
        if (link?.team_member_id) {
          const hideBothNames = !fields.has("name_zh") && !fields.has("name_en");
          await client.query(
            `UPDATE team_members SET name_zh=$2,name_en=$3,role_zh=$4,role_en=$5,bio_zh=$6,bio_en=$7,
               research_zh=$8,research_en=$9,image_asset_id=$10,image_src=$11,updated_at=now() WHERE id=$1`,
            [link.team_member_id, fields.has("name_zh") ? body.nameZh : hideBothNames ? "课题组成员" : "",
              fields.has("name_en") ? body.nameEn : hideBothNames ? "Lab Member" : "", fields.has("title") ? body.titleZh : "",
              fields.has("title") ? body.titleEn : "", fields.has("bio") ? body.bioZh : "", fields.has("bio") ? body.bioEn : "",
              fields.has("research_interests") ? body.researchInterestsZh : "", fields.has("research_interests") ? body.researchInterestsEn : "",
              fields.has("avatar") ? body.avatarAssetId : null, asset.rows[0]?.url ?? null]
          );
          await client.query("DELETE FROM team_member_contacts WHERE team_member_id=$1 AND (lower(label_en)='email' OR label_zh='邮箱')", [link.team_member_id]);
          await client.query("DELETE FROM team_member_links WHERE team_member_id=$1 AND icon IN ('homepage','github')", [link.team_member_id]);
          if (fields.has("email") && body.email) await client.query(
            "INSERT INTO team_member_contacts(team_member_id,sort_order,label_zh,label_en,value_text) VALUES($1,0,'邮箱','Email',$2)", [link.team_member_id, body.email]);
          if (fields.has("homepage") && body.homepageUrl) await client.query(
            "INSERT INTO team_member_links(team_member_id,sort_order,label_zh,label_en,href,icon) VALUES($1,0,'个人主页','Homepage',$2,'homepage')", [link.team_member_id, body.homepageUrl]);
          if (fields.has("github") && body.githubUrl) await client.query(
            "INSERT INTO team_member_links(team_member_id,sort_order,label_zh,label_en,href,icon) VALUES($1,1,'GitHub','GitHub',$2,'github')", [link.team_member_id, body.githubUrl]);
        }
        const user = await client.query<{ username: string }>("UPDATE users SET email=$2,display_name=COALESCE(NULLIF($3,''),NULLIF($4,''),username),updated_at=now() WHERE id=$1 RETURNING username", [userId, body.email || null, body.nameZh, body.nameEn]);
        await client.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,'profile.update','user_profile',$1,$2::jsonb)", [userId, JSON.stringify({ publicFields: body.publicFields })]);
        await client.query("COMMIT");
        return output({ ...row, username: user.rows[0]?.username ?? "" });
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
    }
  };
}
export type ProfileService = ReturnType<typeof createProfileService>;
