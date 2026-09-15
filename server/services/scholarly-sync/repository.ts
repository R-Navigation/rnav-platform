import type { Pool, PoolClient } from "pg";
import { normalizeOrcid, titleFingerprint } from "./normalizer.js";
import type { ManagedField, NormalizedScholarlyWork, ScholarlyProfile } from "./types.js";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

const candidateSelect = `SELECT work.id,work.decision,work.source_type,work.openalex_work_id,work.doi_normalized,work.source_snapshot,
  work.first_seen_at,work.last_seen_at,work.version,work.research_item_id,
  COALESCE(jsonb_agg(jsonb_build_object('userId',users.id,'name',COALESCE(NULLIF(profile.name_zh,''),NULLIF(profile.name_en,''),users.display_name),'position',member.author_position) ORDER BY member.author_position) FILTER(WHERE users.id IS NOT NULL),'[]'::jsonb) members
  FROM scholarly_works work LEFT JOIN scholarly_work_members member ON member.work_id=work.id
  LEFT JOIN users ON users.id=member.user_id LEFT JOIN user_profiles profile ON profile.user_id=users.id`;

const normalizedName = (value: string) => value.toLocaleLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "");
export function countAuthorOverlap(candidateAuthors: string[], existingAuthors: string[]) {
  const candidates = new Set(candidateAuthors.map(normalizedName).filter(Boolean));
  return existingAuthors.filter((name) => candidates.has(normalizedName(name))).length;
}
export function resolveStoredWorkMatch<T>(rows: T[]) {
  if (rows.length > 1) throw new Error("DOI 与 OpenAlex Work ID 命中了不同记录，请人工处理身份冲突");
  return rows[0] ?? null;
}

async function enrichCandidates(queryable: Queryable, rows: Record<string, unknown>[]) {
  const duplicateIds = [...new Set(rows.map((row) => (row.source_snapshot as { possibleDuplicateResearchItemId?: string } | null)?.possibleDuplicateResearchItemId).filter((value): value is string => Boolean(value)))];
  const existing = duplicateIds.length ? await queryable.query<Record<string, unknown>>(
    `SELECT item.id,item.title_zh,item.title_en,item.publication_year,item.venue_zh,item.venue_en,
      COALESCE(jsonb_agg(jsonb_build_object('nameZh',author.name_zh,'nameEn',author.name_en) ORDER BY author.sort_order) FILTER(WHERE author.id IS NOT NULL),'[]'::jsonb) authors
     FROM research_items item LEFT JOIN research_item_authors author ON author.research_item_id=item.id
     WHERE item.id=ANY($1::text[]) GROUP BY item.id`, [duplicateIds],
  ) : { rows: [] as Record<string, unknown>[] };
  const itemMap = new Map(existing.rows.map((row) => [String(row.id), row]));
  return rows.map((row) => {
    const snapshot = row.source_snapshot as { normalized?: { authors?: Array<{ displayName?: string }> }; possibleDuplicateResearchItemId?: string } | null;
    const target = snapshot?.possibleDuplicateResearchItemId ? itemMap.get(snapshot.possibleDuplicateResearchItemId) : undefined;
    const targetAuthors = Array.isArray(target?.authors) ? target.authors as Array<{ nameZh?: string; nameEn?: string }> : [];
    const authorOverlap = countAuthorOverlap((snapshot?.normalized?.authors ?? []).map((author) => author.displayName ?? ""), targetAuthors.flatMap((author) => [author.nameZh, author.nameEn].filter((name): name is string => Boolean(name))));
    const duplicateSuggestion = target ? {
      researchItemId: String(target.id), title: String(target.title_zh || target.title_en || target.id),
      year: target.publication_year == null ? null : Number(target.publication_year), venue: String(target.venue_zh || target.venue_en || ""),
      authors: targetAuthors.map((author) => author.nameZh || author.nameEn || "").filter(Boolean),
      confidence: authorOverlap > 0 ? "high" : "possible", authorOverlap,
    } : null;
    return { ...row, id: row.id, decision: row.decision, sourceSnapshot: row.source_snapshot as { normalized?: unknown } | null, source_snapshot: undefined, duplicateSuggestion, risk: duplicateSuggestion ? (duplicateSuggestion.confidence === "high" ? "high_confidence_duplicate" : "possible_duplicate") : "safe" };
  });
}

function profileRow(row: Record<string, unknown>): ScholarlyProfile {
  return {
    userId: String(row.user_id), orcidId: row.orcid_id ? String(row.orcid_id) : null,
    openalexAuthorId: row.openalex_author_id ? String(row.openalex_author_id) : null,
    identityStatus: String(row.identity_status ?? "unconfigured") as ScholarlyProfile["identityStatus"],
    syncEnabled: Boolean(row.sync_enabled), syncFromYear: row.sync_from_year == null ? null : Number(row.sync_from_year),
    syncToYear: row.sync_to_year == null ? null : Number(row.sync_to_year),
    newWorkPolicy: String(row.new_work_policy ?? "review") as ScholarlyProfile["newWorkPolicy"],
    verifiedAt: row.verified_at ? new Date(String(row.verified_at)).toISOString() : null,
    lastSyncedAt: row.last_synced_at ? new Date(String(row.last_synced_at)).toISOString() : null,
    lastSyncStatus: row.last_sync_status ? String(row.last_sync_status) : null,
    lastSyncMessage: row.last_sync_message ? String(row.last_sync_message) : null,
  };
}

export function resolveScholarlyProfileUpdate(current: ScholarlyProfile, input: Partial<ScholarlyProfile>) {
  const orcidId = input.orcidId === undefined ? current.orcidId : normalizeOrcid(input.orcidId);
  if (input.orcidId && !orcidId) throw new Error("ORCID 格式或校验位无效");
  const orcidChanged = input.orcidId !== undefined && orcidId !== current.orcidId;
  const identityStatus = orcidChanged ? (orcidId ? "pending" : "unconfigured") : current.identityStatus;
  const openalexAuthorId = orcidChanged ? null : current.openalexAuthorId;
  const syncEnabled = orcidChanged ? false : (input.syncEnabled ?? current.syncEnabled);
  const syncFromYear = input.syncFromYear === undefined ? current.syncFromYear : input.syncFromYear;
  const syncToYear = input.syncToYear === undefined ? current.syncToYear : input.syncToYear;
  const newWorkPolicy = orcidChanged ? "review" : (input.newWorkPolicy ?? current.newWorkPolicy);
  if (syncEnabled && identityStatus !== "verified") throw new Error("请先验证 OpenAlex 作者身份再启用同步");
  if (newWorkPolicy === "auto" && (!syncFromYear && !syncToYear)) throw new Error("自动接收前必须设置同步年份范围");
  return { orcidId, orcidChanged, identityStatus, openalexAuthorId, syncEnabled, syncFromYear, syncToYear, newWorkPolicy };
}

const profileSelect = `SELECT users.id user_id,users.display_name,user_profiles.name_zh,user_profiles.name_en,
  user_profiles.degree_level,user_profiles.member_status,user_profiles.enrollment_year,user_profiles.graduation_year,
  scholarly.orcid_id,scholarly.openalex_author_id,COALESCE(scholarly.identity_status,'unconfigured') identity_status,
  COALESCE(scholarly.sync_enabled,false) sync_enabled,
  COALESCE(scholarly.sync_from_year,CASE WHEN user_profiles.degree_level IN ('phd','master','undergrad') AND user_profiles.enrollment_year ~ '^\\d{4}$' THEN user_profiles.enrollment_year::int END) sync_from_year,
  COALESCE(scholarly.sync_to_year,CASE WHEN user_profiles.member_status='alumni' AND user_profiles.graduation_year ~ '^\\d{4}$' THEN user_profiles.graduation_year::int END) sync_to_year,
  COALESCE(scholarly.new_work_policy,'review') new_work_policy,scholarly.verified_at,scholarly.last_synced_at,
  scholarly.last_sync_status,scholarly.last_sync_message
  FROM users JOIN user_profiles ON user_profiles.user_id=users.id
  LEFT JOIN member_scholarly_profiles scholarly ON scholarly.user_id=users.id`;

async function readProfile(queryable: Queryable, userId: string) {
  const result = await queryable.query<Record<string, unknown>>(`${profileSelect} WHERE users.id=$1 AND users.account_kind='person'`, [userId]);
  return result.rows[0] ? { ...profileRow(result.rows[0]), memberName: String(result.rows[0].name_zh || result.rows[0].name_en || result.rows[0].display_name), academicStage: String(result.rows[0].degree_level ?? ""), memberStatus: String(result.rows[0].member_status ?? "current") } : null;
}

export function createScholarlySyncRepository(pool: Pick<Pool, "query" | "connect">) {
  const candidateRows = async (where: string, values: unknown[]) => {
    const result = await pool.query<Record<string, unknown>>(`${candidateSelect} WHERE ${where} GROUP BY work.id ORDER BY work.first_seen_at DESC`, values);
    return enrichCandidates(pool, result.rows);
  };
  return {
    getProfile: (userId: string) => readProfile(pool, userId),
    async saveProfile(userId: string, input: Partial<ScholarlyProfile>, actorId: string, source: "admin" | "self" = "admin") {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const current = await readProfile(client, userId);
        if (!current) { await client.query("ROLLBACK"); return null; }
        const { orcidId, orcidChanged, identityStatus, openalexAuthorId, syncEnabled, syncFromYear, syncToYear, newWorkPolicy } = resolveScholarlyProfileUpdate(current, input);
        await client.query(
          `INSERT INTO member_scholarly_profiles(user_id,orcid_id,openalex_author_id,identity_status,sync_enabled,sync_from_year,sync_to_year,new_work_policy,updated_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())
           ON CONFLICT(user_id) DO UPDATE SET orcid_id=EXCLUDED.orcid_id,openalex_author_id=EXCLUDED.openalex_author_id,
           identity_status=EXCLUDED.identity_status,sync_enabled=EXCLUDED.sync_enabled,sync_from_year=EXCLUDED.sync_from_year,
           sync_to_year=EXCLUDED.sync_to_year,new_work_policy=EXCLUDED.new_work_policy,updated_at=now()`,
          [userId, orcidId, openalexAuthorId, identityStatus, syncEnabled, syncFromYear, syncToYear, newWorkPolicy],
        );
        await client.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,'scholarly.profile.update','member_scholarly_profile',$2,$3::jsonb)", [actorId, userId, JSON.stringify({ source, orcidChanged, syncEnabled, syncFromYear, syncToYear, newWorkPolicy })]);
        const saved = await readProfile(client, userId);
        await client.query("COMMIT");
        return saved;
      } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    },
    async verifyAuthor(userId: string, openalexAuthorId: string, orcidId: string | null, actorId: string, source: "admin" | "self" = "admin") {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO member_scholarly_profiles(user_id,orcid_id,openalex_author_id,identity_status,sync_enabled,verified_at,verified_by,updated_at)
           VALUES($1,$2,$3,'verified',false,now(),$4,now())
           ON CONFLICT(user_id) DO UPDATE SET orcid_id=COALESCE(EXCLUDED.orcid_id,member_scholarly_profiles.orcid_id),
           openalex_author_id=EXCLUDED.openalex_author_id,identity_status='verified',verified_at=now(),verified_by=$4,updated_at=now()`,
          [userId, orcidId, openalexAuthorId, actorId],
        );
        await client.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,'scholarly.author.verify','member_scholarly_profile',$2,$3::jsonb)", [actorId, userId, JSON.stringify({ source, openalexAuthorId })]);
        const saved = await readProfile(client, userId);
        await client.query("COMMIT");
        return saved;
      } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    },
    async listSyncProfiles(userId?: string) {
      const result = await pool.query<Record<string, unknown>>(`${profileSelect} WHERE scholarly.identity_status='verified' AND scholarly.sync_enabled=true${userId ? " AND users.id=$1" : ""} ORDER BY users.id`, userId ? [userId] : []);
      return result.rows.map((row) => ({ ...profileRow(row), memberName: String(row.name_zh || row.name_en || row.display_name), academicStage: String(row.degree_level ?? "") }));
    },
    async findStoredWork(work: NormalizedScholarlyWork) {
      const result = await pool.query<Record<string, unknown>>(
        "SELECT id,provider_hash,provider_updated_at,source_snapshot,decision,source_type,research_item_id FROM scholarly_works WHERE openalex_work_id=$1 OR ($2::text IS NOT NULL AND doi_normalized=$2) ORDER BY (doi_normalized=$2) DESC,(openalex_work_id=$1) DESC LIMIT 2",
        [work.openalexWorkId, work.doi],
      );
      return resolveStoredWorkMatch(result.rows);
    },
    async upsertDiscoveredWork(work: NormalizedScholarlyWork & { mappedType: string }, hash: string, userId: string) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const found = await client.query<Record<string, unknown>>(
          "SELECT * FROM scholarly_works WHERE openalex_work_id=$1 OR ($2::text IS NOT NULL AND doi_normalized=$2) ORDER BY (doi_normalized=$2) DESC,(openalex_work_id=$1) DESC FOR UPDATE",
          [work.openalexWorkId, work.doi],
        );
        let row = resolveStoredWorkMatch(found.rows) ?? undefined;
        const previousHash = row?.provider_hash ? String(row.provider_hash) : null;
        let created = false;
        const snapshot: Record<string, unknown> = { normalized: work };
        const previousSnapshot = row?.source_snapshot as Record<string, unknown> | undefined;
        if (previousSnapshot?.crossrefEnriched) snapshot.crossrefEnriched = true;
        if (previousSnapshot?.possibleDuplicateResearchItemId) snapshot.possibleDuplicateResearchItemId = previousSnapshot.possibleDuplicateResearchItemId;
        if (previousSnapshot?.mergedIntoResearchItemId) snapshot.mergedIntoResearchItemId = previousSnapshot.mergedIntoResearchItemId;
        if (!row) {
          const possibleRows = await client.query<{ id: string; title_en: string; title_zh: string; publication_year: number | null }>(
            "SELECT id,title_en,title_zh,publication_year FROM research_items WHERE publication_year IS NOT DISTINCT FROM $1",
            [work.year],
          );
          const possible = possibleRows.rows.find((item) => titleFingerprint(item.title_en || item.title_zh, item.publication_year) === titleFingerprint(work.title, work.year));
          if (possible) snapshot.possibleDuplicateResearchItemId = possible.id;
          const inserted = await client.query<Record<string, unknown>>(
            `INSERT INTO scholarly_works(openalex_work_id,doi_normalized,decision,source_snapshot,provider_hash,provider_updated_at,last_seen_at,last_synced_at)
             VALUES($1,$2,'pending',$3::jsonb,$4,$5,now(),now()) RETURNING *`,
            [work.openalexWorkId, work.doi, JSON.stringify(snapshot), hash, work.providerUpdatedAt],
          );
          row = inserted.rows[0]; created = true;
        } else {
          const updated = await client.query<Record<string, unknown>>(
            `UPDATE scholarly_works SET openalex_work_id=COALESCE(openalex_work_id,$2),doi_normalized=COALESCE(doi_normalized,$3),
             source_snapshot=$4::jsonb,provider_hash=$5,provider_updated_at=$6,last_seen_at=now(),last_synced_at=now(),version=version+1
             WHERE id=$1 RETURNING *`,
            [row.id, work.openalexWorkId, work.doi, JSON.stringify(snapshot), hash, work.providerUpdatedAt],
          );
          row = updated.rows[0];
        }
        const memberProfile = await client.query<{ openalex_author_id: string }>("SELECT openalex_author_id FROM member_scholarly_profiles WHERE user_id=$1", [userId]);
        const memberPosition = work.authors.find((author) => author.openalexAuthorId && author.openalexAuthorId === memberProfile.rows[0]?.openalex_author_id)?.position ?? null;
        await client.query("INSERT INTO scholarly_work_members(work_id,user_id,author_position,matched_by,confidence) VALUES($1,$2,$3,'openalex_author_id',1) ON CONFLICT(work_id,user_id) DO UPDATE SET author_position=EXCLUDED.author_position", [row.id, userId, memberPosition]);
        await client.query("COMMIT");
        return { row, created, changed: created || previousHash !== hash };
      } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    },
    async updateMemberSync(userId: string, status: string, message: string) {
      await pool.query("UPDATE member_scholarly_profiles SET last_synced_at=now(),last_sync_status=$2,last_sync_message=$3,updated_at=now() WHERE user_id=$1", [userId, status, message.slice(0, 1000)]);
    },
    async createRun(triggerType: string, actorId: string | null) {
      const result = await pool.query<{ id: string }>("INSERT INTO scholarly_sync_runs(trigger_type,triggered_by,status) VALUES($1,$2,'running') RETURNING id", [triggerType, actorId]);
      return result.rows[0].id;
    },
    async finishRun(id: string, summary: { status: string; membersChecked: number; worksSeen: number; candidatesCreated: number; worksUpdated: number; failures: number; errors: unknown[] }) {
      await pool.query(`UPDATE scholarly_sync_runs SET status=$2,finished_at=now(),members_checked=$3,works_seen=$4,candidates_created=$5,works_updated=$6,failures=$7,error_summary=$8::jsonb WHERE id=$1`, [id, summary.status, summary.membersChecked, summary.worksSeen, summary.candidatesCreated, summary.worksUpdated, summary.failures, JSON.stringify(summary.errors)]);
    },
    async listCandidates(decision: "pending" | "ignored") {
      return candidateRows("work.decision=$1 AND work.source_type='openalex'", [decision]);
    },
    async getWorksByIds(ids: string[]) {
      if (!ids.length) return [];
      return candidateRows("work.id=ANY($1::uuid[])", [ids]);
    },
    async status() {
      const [profiles, candidates, ignored, lastRun] = await Promise.all([
        pool.query<{ verified: number; enabled: number; total: number }>("SELECT count(*)::int total,count(*) FILTER(WHERE identity_status='verified')::int verified,count(*) FILTER(WHERE sync_enabled)::int enabled FROM member_scholarly_profiles"),
        pool.query<{ count: number }>("SELECT count(*)::int count FROM scholarly_works WHERE decision='pending'"),
        pool.query<{ count: number }>("SELECT count(*)::int count FROM scholarly_works WHERE decision='ignored'"),
        pool.query<Record<string, unknown>>("SELECT * FROM scholarly_sync_runs ORDER BY started_at DESC LIMIT 1"),
      ]);
      return { profiles: profiles.rows[0], pending: candidates.rows[0].count, ignored: ignored.rows[0].count, lastRun: lastRun.rows[0] ?? null };
    },
    async listRuns() {
      return (await pool.query("SELECT * FROM scholarly_sync_runs ORDER BY started_at DESC LIMIT 50")).rows;
    },
    async getResearchItemSyncInfo(researchItemId: string) {
      const result = await pool.query<Record<string, unknown>>(`SELECT id,source_type,openalex_work_id,doi_normalized,decision,managed_fields,provider_updated_at,last_synced_at,version FROM scholarly_works WHERE research_item_id=$1`, [researchItemId]);
      return result.rows[0] ?? { source_type: "manual", decision: "accepted", managed_fields: [] };
    },
    async setManagedFields(researchItemId: string, managedFields: ManagedField[], actorId: string) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query("UPDATE scholarly_works SET managed_fields=$2,version=version+1 WHERE research_item_id=$1 RETURNING id", [researchItemId, managedFields]);
        if (!result.rowCount) { await client.query("ROLLBACK"); return false; }
        await client.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,'scholarly.managed_fields.update','research_item',$2,$3::jsonb)", [actorId, researchItemId, JSON.stringify({ managedFields })]);
        await client.query("COMMIT");
        return true;
      } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    },
    pool,
  };
}

export type ScholarlySyncRepository = ReturnType<typeof createScholarlySyncRepository>;
