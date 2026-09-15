import type { Pool, PoolClient } from "pg";
import { stableResearchItemId } from "../research/researchItemRepository.js";

export const SCHOLARLY_SYNC_LOCK = 724866120041;

export type ResetWorkRow = {
  workId: string;
  sourceType: "manual" | "openalex";
  decision: "pending" | "accepted" | "ignored";
  researchItemId: string | null;
  openalexWorkId: string | null;
  otherMemberCount: number;
};

export type MemberResetPlan = {
  relationCount: number;
  pendingCandidates: number;
  ignoredCandidates: number;
  acceptedSyncCreated: number;
  mergedManualPublications: number;
  sharedWorksPreserved: number;
  manualWorksProtected: number;
  featuredBlocks: string[];
  researchItemIdsToDelete: string[];
  workIdsToDelete: string[];
  removableRelationWorkIds: string[];
  blocked: boolean;
};

export type ResetMemberProfile = {
  userId: string;
  username: string;
  memberName: string;
  orcidId: string | null;
  openalexAuthorId: string | null;
  identityStatus: string;
  syncEnabled: boolean;
  syncFromYear: number | null;
  syncToYear: number | null;
};

export function planMemberReset(rows: ResetWorkRow[], featuredResearchIds: string[]): MemberResetPlan {
  const researchItemIdsToDelete: string[] = [];
  const workIdsToDelete: string[] = [];
  const removableRelationWorkIds: string[] = [];
  const featured = new Set(featuredResearchIds);
  const featuredBlocks: string[] = [];
  let pendingCandidates = 0;
  let ignoredCandidates = 0;
  let acceptedSyncCreated = 0;
  let mergedManualPublications = 0;
  let sharedWorksPreserved = 0;
  let manualWorksProtected = 0;

  for (const row of rows) {
    if (row.sourceType === "manual") {
      manualWorksProtected += 1;
      continue;
    }
    removableRelationWorkIds.push(row.workId);
    if (row.otherMemberCount > 0) {
      sharedWorksPreserved += 1;
      continue;
    }
    if (row.decision === "pending") pendingCandidates += 1;
    if (row.decision === "ignored") ignoredCandidates += 1;
    const generatedId = row.openalexWorkId ? stableResearchItemId(row.openalexWorkId) : null;
    const syncCreated = row.decision === "accepted" && Boolean(row.researchItemId && generatedId === row.researchItemId);
    const merged = row.decision === "accepted" && Boolean(row.researchItemId && generatedId !== row.researchItemId);
    if (syncCreated) {
      acceptedSyncCreated += 1;
      researchItemIdsToDelete.push(row.researchItemId!);
      if (featured.has(row.researchItemId!)) featuredBlocks.push(row.researchItemId!);
    }
    if (merged) mergedManualPublications += 1;
    workIdsToDelete.push(row.workId);
  }

  return {
    relationCount: rows.length,
    pendingCandidates,
    ignoredCandidates,
    acceptedSyncCreated,
    mergedManualPublications,
    sharedWorksPreserved,
    manualWorksProtected,
    featuredBlocks: [...new Set(featuredBlocks)],
    researchItemIdsToDelete: [...new Set(researchItemIdsToDelete)],
    workIdsToDelete: [...new Set(workIdsToDelete)],
    removableRelationWorkIds: [...new Set(removableRelationWorkIds)],
    blocked: manualWorksProtected > 0 || featuredBlocks.length > 0,
  };
}

function featuredIds(content: unknown) {
  const page = content && typeof content === "object" ? content as Record<string, unknown> : {};
  const ids = Array.isArray(page.featuredResearchIds) ? page.featuredResearchIds.map(String) : [];
  if (typeof page.featuredPublicationId === "string" && page.featuredPublicationId) ids.push(page.featuredPublicationId);
  return ids;
}

async function loadResetState(client: Pick<PoolClient, "query">, userId: string) {
  const profileResult = await client.query<Record<string, unknown>>(
    `SELECT profile.user_id,users.username,COALESCE(NULLIF(public.name_zh,''),NULLIF(public.name_en,''),users.display_name) member_name,
      profile.orcid_id,profile.openalex_author_id,profile.identity_status,profile.sync_enabled,profile.sync_from_year,profile.sync_to_year
     FROM member_scholarly_profiles profile JOIN users ON users.id=profile.user_id
     LEFT JOIN user_profiles public ON public.user_id=users.id WHERE profile.user_id=$1`,
    [userId],
  );
  if (!profileResult.rows[0]) throw new Error("Scholarly member profile not found");
  const profileRow = profileResult.rows[0];
  const profile: ResetMemberProfile = {
    userId: String(profileRow.user_id), username: String(profileRow.username), memberName: String(profileRow.member_name),
    orcidId: profileRow.orcid_id ? String(profileRow.orcid_id) : null,
    openalexAuthorId: profileRow.openalex_author_id ? String(profileRow.openalex_author_id) : null,
    identityStatus: String(profileRow.identity_status), syncEnabled: Boolean(profileRow.sync_enabled),
    syncFromYear: profileRow.sync_from_year == null ? null : Number(profileRow.sync_from_year),
    syncToYear: profileRow.sync_to_year == null ? null : Number(profileRow.sync_to_year),
  };
  const relations = await client.query<Record<string, unknown>>(
    `SELECT work.id work_id,work.source_type,work.decision,work.research_item_id,work.openalex_work_id,
      (SELECT count(*)::int FROM scholarly_work_members other WHERE other.work_id=work.id AND other.user_id<>$1) other_member_count
     FROM scholarly_work_members relation JOIN scholarly_works work ON work.id=relation.work_id
     WHERE relation.user_id=$1 ORDER BY work.id`,
    [userId],
  );
  const home = await client.query<{ content_json: unknown }>("SELECT content_json FROM page_content WHERE page_key='home'");
  const rows: ResetWorkRow[] = relations.rows.map((row) => ({
    workId: String(row.work_id), sourceType: String(row.source_type) as ResetWorkRow["sourceType"],
    decision: String(row.decision) as ResetWorkRow["decision"], researchItemId: row.research_item_id ? String(row.research_item_id) : null,
    openalexWorkId: row.openalex_work_id ? String(row.openalex_work_id) : null, otherMemberCount: Number(row.other_member_count ?? 0),
  }));
  return { profile, plan: planMemberReset(rows, featuredIds(home.rows[0]?.content_json)) };
}

export async function previewMemberReset(pool: Pick<Pool, "connect">, userId: string) {
  const client = await pool.connect();
  try { return await loadResetState(client, userId); } finally { client.release(); }
}

export async function executeMemberReset(pool: Pick<Pool, "connect">, userId: string, confirmUsername: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_xact_lock($1) locked", [SCHOLARLY_SYNC_LOCK]);
    if (!locked.rows[0]?.locked) throw new Error("Another scholarly sync operation is running");
    await client.query("SELECT user_id FROM member_scholarly_profiles WHERE user_id=$1 FOR UPDATE", [userId]);
    const state = await loadResetState(client, userId);
    if (state.profile.username !== confirmUsername) throw new Error("Typed username confirmation does not match");
    if (state.plan.blocked) throw new Error("Reset is blocked because a manual or homepage-featured publication is at risk");

    await client.query("DELETE FROM scholarly_work_members WHERE user_id=$1 AND work_id=ANY($2::uuid[])", [userId, state.plan.removableRelationWorkIds]);
    let deletedResearchItems = 0;
    if (state.plan.researchItemIdsToDelete.length) {
      const deleted = await client.query("DELETE FROM research_items WHERE id=ANY($1::text[]) RETURNING id", [state.plan.researchItemIdsToDelete]);
      deletedResearchItems = deleted.rowCount ?? 0;
      if (deletedResearchItems !== state.plan.researchItemIdsToDelete.length) throw new Error("Research item deletion count changed during reset");
    }
    let deletedWorks = 0;
    if (state.plan.workIdsToDelete.length) {
      const deleted = await client.query(
        "DELETE FROM scholarly_works work WHERE work.id=ANY($1::uuid[]) AND work.source_type='openalex' AND NOT EXISTS(SELECT 1 FROM scholarly_work_members relation WHERE relation.work_id=work.id) RETURNING id",
        [state.plan.workIdsToDelete],
      );
      deletedWorks = deleted.rowCount ?? 0;
      if (deletedWorks !== state.plan.workIdsToDelete.length) throw new Error("Scholarly work deletion count changed during reset");
    }
    const range = state.profile.syncFromYear ? `从 ${state.profile.syncFromYear} 年开始的首次同步范围` : "首次同步范围";
    await client.query(
      "UPDATE member_scholarly_profiles SET sync_enabled=false,last_synced_at=NULL,last_sync_status='reset',last_sync_message=$2,updated_at=now() WHERE user_id=$1",
      [userId, `${range}已安全清空。请重新设置正确起始年份后再启用同步。`],
    );
    const detail = { relationsRemoved: state.plan.removableRelationWorkIds.length, worksDeleted: deletedWorks, researchItemsDeleted: deletedResearchItems, sharedWorksPreserved: state.plan.sharedWorksPreserved, mergedManualPublicationsPreserved: state.plan.mergedManualPublications };
    await client.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES(NULL,'scholarly.member.reset','member_scholarly_profile',$1,$2::jsonb)", [userId, JSON.stringify(detail)]);
    await client.query("COMMIT");
    return { ...state, executed: true, result: detail };
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
