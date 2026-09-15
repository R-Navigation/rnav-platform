import type { Pool, PoolClient } from "pg";
import { stableResearchItemId, upsertResearchItem } from "../research/researchItemRepository.js";
import { mapPublicationType, normalizeDoi, normalizeOrcid, normalizeWork, providerHash } from "./normalizer.js";
import type { CrossrefClient } from "./providers/crossrefClient.js";
import { ProviderHttpError } from "./providers/http.js";
import type { OpenAlexClient } from "./providers/openAlexClient.js";
import type { OpenAlexStatusMonitor } from "./providers/openAlexStatus.js";
import type { ScholarlySyncRepository } from "./repository.js";
import type { ManagedField, NormalizedScholarlyWork } from "./types.js";
import { createBulkPlan } from "./bulkPlanner.js";

export class ScholarlySyncError extends Error {
  constructor(message: string, readonly code = "SCHOLARLY_SYNC_ERROR", readonly status = 400) {
    super(message); this.name = "ScholarlySyncError";
  }
}

const SYNC_LOCK = 724866120041;
const defaultManagedFields: ManagedField[] = ["title_en", "year", "venue_en", "type", "doi_link", "external_links"];
const cleanError = (error: unknown) => error instanceof ProviderHttpError
  ? `${error.provider} 请求失败（${error.status}）`
  : error instanceof Error ? error.message.slice(0, 300) : "未知同步错误";

function researchItemFromWork(work: NormalizedScholarlyWork & { mappedType: string }, highlightedIds: Set<string>, sortOrder: number) {
  const links: Array<Record<string, unknown>> = [];
  if (work.doiUrl) links.push({ label: { zh: "DOI", en: "DOI" }, href: work.doiUrl, icon: "doi", variant: "" });
  if (work.arxivUrl) links.push({ label: { zh: "ArXiv", en: "ArXiv" }, href: work.arxivUrl, icon: "arxiv", variant: "" });
  if (work.landingPageUrl && !links.some((item) => item.href === work.landingPageUrl)) links.push({ label: { zh: "出版页面", en: "Publisher" }, href: work.landingPageUrl, icon: "link", variant: "" });
  return {
    id: stableResearchItemId(work.openalexWorkId), sortOrder,
    title: { zh: "", en: work.title }, year: work.year, venue: { zh: "", en: work.venue },
    type: work.mappedType, topic: "", image: null, pdf: null, keywords: [],
    authors: work.authors.map((author) => ({ name: { zh: "", en: author.displayName }, highlight: Boolean(author.openalexAuthorId && highlightedIds.has(author.openalexAuthorId)) })),
    links,
  };
}

async function bumpResearchRevision(client: Pick<PoolClient, "query">) {
  await client.query("UPDATE site_content_revisions SET revision=revision+1,updated_at=now() WHERE module_key='research-items'");
}

async function audit(client: Pick<PoolClient, "query">, actorId: string, action: string, targetType: string, targetId: string, detail: unknown = {}) {
  await client.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,$2,$3,$4,$5::jsonb)", [actorId, action, targetType, targetId, JSON.stringify(detail)]);
}

type ProviderConfig = { openAlexKeyConfigured: boolean; crossrefContactConfigured: boolean };
type DynamicOption<T> = T | (() => T | Promise<T>);

export function createScholarlySyncService(options: {
  pool: Pick<Pool, "query" | "connect">;
  repository: ScholarlySyncRepository;
  openAlex: OpenAlexClient;
  crossref: CrossrefClient;
  enabled: DynamicOption<boolean>;
  providerConfig: DynamicOption<ProviderConfig>;
  openAlexStatus?: OpenAlexStatusMonitor;
}) {
  const { pool, repository, openAlex, crossref } = options;
  const resolveOption = async <T,>(value: DynamicOption<T>) => typeof value === "function" ? (value as () => T | Promise<T>)() : value;

  async function acceptWork(workId: string, actorId: string | null, automatic = false) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<Record<string, unknown>>("SELECT * FROM scholarly_works WHERE id=$1 FOR UPDATE", [workId]);
      const row = result.rows[0];
      if (!row) throw new ScholarlySyncError("候选论文不存在", "NOT_FOUND", 404);
      if (row.decision === "accepted" && row.research_item_id) { await client.query("COMMIT"); return { researchItemId: row.research_item_id, unchanged: true }; }
      const snapshot = row.source_snapshot as { normalized?: NormalizedScholarlyWork & { mappedType?: string }; mergedIntoResearchItemId?: string };
      if (row.decision === "accepted" && snapshot?.mergedIntoResearchItemId) { await client.query("COMMIT"); return { researchItemId: snapshot.mergedIntoResearchItemId, unchanged: true }; }
      if (row.decision === "accepted") throw new ScholarlySyncError("已接收候选缺少有效论文绑定，请人工检查", "STATE_CONFLICT", 409);
      if (!snapshot?.normalized) throw new ScholarlySyncError("候选论文缺少规范化元数据", "INVALID_SNAPSHOT", 409);
      const normalized = { ...snapshot.normalized, mappedType: snapshot.normalized.mappedType ?? mapPublicationType(snapshot.normalized.providerType) };
      const linked = await client.query<{ openalex_author_id: string }>(`SELECT profile.openalex_author_id FROM member_scholarly_profiles profile JOIN scholarly_work_members member ON member.user_id=profile.user_id WHERE member.work_id=$1 AND profile.identity_status='verified'`, [workId]);
      const nextSort = await client.query<{ sort_order: number }>("SELECT COALESCE(max(sort_order),-1)+1 sort_order FROM research_items");
      const item = researchItemFromWork(normalized, new Set(linked.rows.map((entry) => entry.openalex_author_id)), Number(nextSort.rows[0].sort_order));
      const collision = await client.query<{ id: string }>("SELECT id FROM research_items WHERE id=$1", [item.id]);
      if (collision.rowCount && row.research_item_id !== item.id) throw new ScholarlySyncError("自动生成的论文 ID 已存在，请改用合并操作", "ID_CONFLICT", 409);
      await upsertResearchItem(client, item);
      await client.query("UPDATE scholarly_works SET decision='accepted',research_item_id=$2,managed_fields=$3,reviewed_at=now(),reviewed_by=$4,version=version+1 WHERE id=$1", [workId, item.id, defaultManagedFields, actorId]);
      await bumpResearchRevision(client);
      if (actorId) await audit(client, actorId, "scholarly.work.accept", "scholarly_work", workId, { researchItemId: item.id, automatic });
      await client.query("COMMIT");
      return { researchItemId: item.id, unchanged: false };
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  async function applyManagedUpdates(workId: string, work: NormalizedScholarlyWork & { mappedType: string }) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const stored = await client.query<{ research_item_id: string | null; managed_fields: ManagedField[] }>("SELECT research_item_id,managed_fields FROM scholarly_works WHERE id=$1 AND decision='accepted' FOR UPDATE", [workId]);
      const row = stored.rows[0];
      if (!row?.research_item_id) { await client.query("COMMIT"); return false; }
      const managed = new Set(row.managed_fields);
      const updates: string[] = []; const values: unknown[] = [row.research_item_id];
      const add = (column: string, value: unknown) => { values.push(value); updates.push(`${column}=$${values.length}`); };
      if (managed.has("title_en")) add("title_en", work.title);
      if (managed.has("year")) add("publication_year", work.year);
      if (managed.has("venue_en")) add("venue_en", work.venue);
      if (managed.has("type")) add("publication_type", work.mappedType);
      let changed = false;
      if (updates.length) {
        const result = await client.query(`UPDATE research_items SET ${updates.join(",")},updated_at=now() WHERE id=$1 AND ROW(${updates.map((entry) => entry.split("=")[0]).join(",")}) IS DISTINCT FROM ROW(${values.slice(1).map((_, index) => `$${index + 2}`).join(",")}) RETURNING id`, values);
        changed = Boolean(result.rowCount);
      }
      if (managed.has("doi_link") || managed.has("external_links")) {
        const current = await client.query<{ href: string; icon: string }>("SELECT href,icon FROM research_item_links WHERE research_item_id=$1 AND icon IN ('doi','arxiv','link') ORDER BY sort_order", [row.research_item_id]);
        const expected = [
          ...(managed.has("doi_link") && work.doiUrl ? [{ href: work.doiUrl, icon: "doi" }] : current.rows.filter((entry) => entry.icon === "doi")),
          ...(managed.has("external_links") ? [work.arxivUrl ? { href: work.arxivUrl, icon: "arxiv" } : null, work.landingPageUrl ? { href: work.landingPageUrl, icon: "link" } : null].filter(Boolean) as Array<{ href: string; icon: string }> : current.rows.filter((entry) => entry.icon !== "doi")),
        ].filter((entry, index, all) => all.findIndex((candidate) => candidate.href === entry.href) === index);
        if (JSON.stringify(current.rows) !== JSON.stringify(expected)) {
          await client.query("DELETE FROM research_item_links WHERE research_item_id=$1 AND icon IN ('doi','arxiv','link')", [row.research_item_id]);
          for (const [index, link] of expected.entries()) await client.query("INSERT INTO research_item_links(research_item_id,sort_order,label_zh,label_en,href,icon,variant) VALUES($1,$2,$3,$3,$4,$5,'')", [row.research_item_id, index, link.icon === "link" ? "Publisher" : link.icon.toUpperCase(), link.href, link.icon]);
          changed = true;
        }
      }
      if (changed) await bumpResearchRevision(client);
      await client.query("COMMIT"); return changed;
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  async function sync(triggerType: "scheduled" | "manual_all" | "manual_member" | "backfill", actorId: string | null, userId?: string, source: "admin" | "self" = "admin") {
    if (!(await resolveOption(options.enabled))) throw new ScholarlySyncError("论文自动同步尚未启用", "SYNC_DISABLED", 503);
    const lockClient = await pool.connect();
    let locked = false; let runId: string | null = null;
    let successfulMembers = 0;
    const summary = { status: "success", membersChecked: 0, worksSeen: 0, candidatesCreated: 0, worksUpdated: 0, failures: 0, errors: [] as Array<{ memberId?: string; message: string }> };
    try {
      locked = Boolean((await lockClient.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1) locked", [SYNC_LOCK])).rows[0]?.locked);
      if (!locked) return { skipped: true, reason: "another_sync_is_running", ...summary };
      runId = await repository.createRun(triggerType, actorId);
      const profiles = await repository.listSyncProfiles(userId);
      for (const profile of profiles) {
        summary.membersChecked += 1;
        try {
          const works = await openAlex.getWorksByAuthor(profile.openalexAuthorId!, profile.syncFromYear, profile.syncToYear);
          for (const openAlexWork of works) {
            summary.worksSeen += 1;
            let normalized = normalizeWork(openAlexWork);
            const stored = await repository.findStoredWork(normalized);
            const storedSnapshot = stored?.source_snapshot as { normalized?: { providerUpdatedAt?: string | null }; crossrefEnriched?: boolean } | undefined;
            const stale = !stored || storedSnapshot?.normalized?.providerUpdatedAt !== normalized.providerUpdatedAt || !storedSnapshot?.crossrefEnriched;
            let crossrefEnriched = false;
            let crossrefAttempted = false;
            if (normalized.doi && stale) {
              crossrefAttempted = true;
              try { normalized = normalizeWork(openAlexWork, await crossref.getWorkByDoi(normalized.doi)); crossrefEnriched = true; }
              catch (error) { summary.failures += 1; summary.errors.push({ memberId: profile.userId, message: cleanError(error) }); }
            }
            const mapped = { ...normalized, mappedType: mapPublicationType(normalized.providerType) };
            const upserted = await repository.upsertDiscoveredWork(mapped, providerHash(normalized), profile.userId);
            if (upserted.created) summary.candidatesCreated += 1;
            if (crossrefAttempted) await pool.query("UPDATE scholarly_works SET source_snapshot=jsonb_set(source_snapshot,'{crossrefEnriched}',to_jsonb($2::boolean),true) WHERE id=$1", [upserted.row.id, crossrefEnriched]);
            const possibleDuplicate = Boolean((upserted.row.source_snapshot as { possibleDuplicateResearchItemId?: string } | undefined)?.possibleDuplicateResearchItemId);
            const automaticPolicyAllowed = profile.newWorkPolicy === "auto"
              && Number.isInteger(profile.syncFromYear) && Number.isInteger(profile.syncToYear)
              && profile.syncFromYear! <= profile.syncToYear!;
            if (upserted.created && source !== "self" && automaticPolicyAllowed && !possibleDuplicate) {
              await acceptWork(String(upserted.row.id), actorId, true); summary.worksUpdated += 1;
            } else if (upserted.row.decision === "accepted" && upserted.row.source_type === "openalex" && upserted.changed) {
              if (await applyManagedUpdates(String(upserted.row.id), mapped)) summary.worksUpdated += 1;
            }
          }
          await repository.updateMemberSync(profile.userId, "success", `已检查 ${works.length} 篇成果`);
          successfulMembers += 1;
        } catch (error) {
          summary.failures += 1; summary.errors.push({ memberId: profile.userId, message: cleanError(error) });
          await repository.updateMemberSync(profile.userId, "failed", cleanError(error));
        }
      }
      summary.status = summary.failures ? (summary.membersChecked > 0 && successfulMembers === 0 ? "failed" : "partial") : "success";
      if (actorId) await pool.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,'scholarly.sync.manual','scholarly_sync_run',$2,$3::jsonb)", [actorId, runId, JSON.stringify({ source, triggerType, userId: userId ?? null })]);
      return { skipped: false, runId, ...summary };
    } catch (error) {
      summary.status = "failed"; summary.failures += 1; summary.errors.push({ message: cleanError(error) }); throw error;
    } finally {
      if (runId) await repository.finishRun(runId, summary).catch(() => undefined);
      if (locked) await lockClient.query("SELECT pg_advisory_unlock($1)", [SYNC_LOCK]).catch(() => undefined);
      lockClient.release();
    }
  }

  async function decision(workId: string, action: "ignore" | "restore", actorId: string) {
    const from = action === "ignore" ? "pending" : "ignored";
    const to = action === "ignore" ? "ignored" : "pending";
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{ id: string }>("UPDATE scholarly_works SET decision=$3,reviewed_at=now(),reviewed_by=$4,version=version+1 WHERE id=$1 AND decision=$2 RETURNING id", [workId, from, to, actorId]);
      if (!result.rowCount) throw new ScholarlySyncError("候选状态已经变化，请刷新后重试", "STATE_CONFLICT", 409);
      await client.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,$2,'scholarly_work',$3,'{}'::jsonb)", [actorId, `scholarly.work.${action}`, workId]);
      await client.query("COMMIT");
      return { id: workId, decision: to };
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  async function mergeWork(workId: string, researchItemId: string, actorId: string) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const work = await client.query<{ decision: string; research_item_id: string | null; source_snapshot: Record<string, unknown> }>("SELECT decision,research_item_id,source_snapshot FROM scholarly_works WHERE id=$1 FOR UPDATE", [workId]);
      if (!work.rowCount) throw new ScholarlySyncError("候选论文不存在", "NOT_FOUND", 404);
      if (work.rows[0].decision === "accepted" && work.rows[0].research_item_id === researchItemId) { await client.query("COMMIT"); return { researchItemId, unchanged: true }; }
      if (work.rows[0].decision === "accepted" && work.rows[0].source_snapshot?.mergedIntoResearchItemId === researchItemId) { await client.query("COMMIT"); return { researchItemId, unchanged: true, alias: true }; }
      if (work.rows[0].decision === "accepted") throw new ScholarlySyncError("候选已绑定其他论文，请刷新后重试", "STATE_CONFLICT", 409);
      const item = await client.query("SELECT id FROM research_items WHERE id=$1 FOR UPDATE", [researchItemId]);
      if (!item.rowCount) throw new ScholarlySyncError("目标论文不存在", "NOT_FOUND", 404);
      const targetRegistry = await client.query<{ id: string }>("SELECT id FROM scholarly_works WHERE research_item_id=$1 AND id<>$2 FOR UPDATE", [researchItemId, workId]);
      if (targetRegistry.rows[0]) {
        await client.query(
          `INSERT INTO scholarly_work_members(work_id,user_id,author_position,matched_by,confidence)
           SELECT $2,user_id,author_position,matched_by,confidence FROM scholarly_work_members WHERE work_id=$1
           ON CONFLICT(work_id,user_id) DO UPDATE SET author_position=COALESCE(scholarly_work_members.author_position,EXCLUDED.author_position),confidence=GREATEST(scholarly_work_members.confidence,EXCLUDED.confidence)`,
          [workId, targetRegistry.rows[0].id],
        );
        await client.query("UPDATE scholarly_works SET decision='accepted',research_item_id=NULL,managed_fields=ARRAY[]::text[],source_snapshot=jsonb_set(source_snapshot,'{mergedIntoResearchItemId}',to_jsonb($2::text),true),reviewed_at=now(),reviewed_by=$3,version=version+1 WHERE id=$1", [workId, researchItemId, actorId]);
        await audit(client, actorId, "scholarly.work.merge", "scholarly_work", workId, { researchItemId, targetRegistryId: targetRegistry.rows[0].id, alias: true });
        await client.query("COMMIT"); return { researchItemId, unchanged: false, alias: true };
      }
      await client.query("UPDATE scholarly_works SET decision='accepted',research_item_id=$2,managed_fields=ARRAY[]::text[],reviewed_at=now(),reviewed_by=$3,version=version+1 WHERE id=$1", [workId, researchItemId, actorId]);
      await audit(client, actorId, "scholarly.work.merge", "scholarly_work", workId, { researchItemId, alias: false });
      await client.query("COMMIT"); return { researchItemId, unchanged: false, alias: false };
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  async function auditBulk(actorId: string, action: string, detail: unknown) {
    await pool.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,$2,'scholarly_bulk','batch',$3::jsonb)", [actorId, action, JSON.stringify(detail)]);
  }

  async function planBulk(workIds: string[]) {
    return createBulkPlan(workIds, await repository.getWorksByIds(workIds));
  }

  async function bulkAccept(workIds: string[], actorId: string) {
    const plan = await planBulk(workIds); const results: Array<Record<string, unknown>> = [];
    for (const item of plan.items) {
      if (item.action === "already_accepted") { results.push({ ...item, status: "already_accepted" }); continue; }
      if (item.action !== "safe_accept") { results.push({ ...item, status: "skipped" }); continue; }
      try { const result = await acceptWork(item.workId, actorId); results.push({ ...item, status: result.unchanged ? "already_accepted" : "accepted", ...result }); }
      catch (error) { results.push({ ...item, status: "failed", error: cleanError(error) }); }
    }
    const summary = { requested: workIds.length, accepted: results.filter((item) => item.status === "accepted").length, alreadyAccepted: results.filter((item) => item.status === "already_accepted").length, skipped: results.filter((item) => item.status === "skipped").length, failed: results.filter((item) => item.status === "failed").length, results };
    await auditBulk(actorId, "scholarly.bulk.accept", { ...summary, results: undefined }); return summary;
  }

  async function bulkIgnore(workIds: string[], actorId: string) {
    const works = await repository.getWorksByIds(workIds); const byId = new Map(works.map((work) => [String(work.id), work])); const results: Array<Record<string, unknown>> = [];
    for (const workId of workIds) {
      const current = byId.get(workId);
      if (!current) { results.push({ workId, status: "failed", error: "候选论文不存在" }); continue; }
      if (current.decision === "ignored") { results.push({ workId, status: "already_ignored" }); continue; }
      if (current.decision !== "pending") { results.push({ workId, status: "skipped", error: "仅待确认论文可以忽略" }); continue; }
      try { await decision(workId, "ignore", actorId); results.push({ workId, status: "ignored" }); }
      catch (error) { results.push({ workId, status: "failed", error: cleanError(error) }); }
    }
    const summary = { requested: workIds.length, ignored: results.filter((item) => item.status === "ignored").length, alreadyIgnored: results.filter((item) => item.status === "already_ignored").length, skipped: results.filter((item) => item.status === "skipped").length, failed: results.filter((item) => item.status === "failed").length, results };
    await auditBulk(actorId, "scholarly.bulk.ignore", { ...summary, results: undefined }); return summary;
  }

  async function bulkMerge(items: Array<{ workId: string; researchItemId: string }>, actorId: string) {
    const results: Array<Record<string, unknown>> = [];
    for (const item of items) {
      try { const result = await mergeWork(item.workId, item.researchItemId, actorId); results.push({ ...item, status: result.unchanged ? "already_merged" : "merged" }); }
      catch (error) { results.push({ ...item, status: "failed", error: cleanError(error) }); }
    }
    const summary = { requested: items.length, merged: results.filter((item) => item.status === "merged").length, alreadyMerged: results.filter((item) => item.status === "already_merged").length, failed: results.filter((item) => item.status === "failed").length, results };
    await auditBulk(actorId, "scholarly.bulk.merge", { ...summary, results: undefined }); return summary;
  }

  return {
    getProfile: (userId: string) => repository.getProfile(userId),
    updateProfile: (userId: string, input: Parameters<ScholarlySyncRepository["saveProfile"]>[1], actorId: string, source: "admin" | "self" = "admin") => repository.saveProfile(userId, input, actorId, source),
    async resolveAuthor(userId: string, input: { orcidId?: string | null; name?: string; institution?: string }) {
      const profile = await repository.getProfile(userId);
      if (!profile) throw new ScholarlySyncError("成员不存在", "NOT_FOUND", 404);
      const orcid = input.orcidId ? normalizeOrcid(input.orcidId) : profile.orcidId;
      if (input.orcidId && !orcid) throw new ScholarlySyncError("ORCID 格式或校验位无效", "INVALID_ORCID");
      return orcid ? [await openAlex.resolveAuthorByOrcid(orcid)] : openAlex.searchAuthorCandidates(input.name || profile.memberName, input.institution);
    },
    async verifyAuthor(userId: string, openalexAuthorId: string, actorId: string, source: "admin" | "self" = "admin") {
      const profile = await repository.getProfile(userId);
      if (!profile) throw new ScholarlySyncError("成员不存在", "NOT_FOUND", 404);
      const candidate = await openAlex.getAuthor(openalexAuthorId);
      if (profile.orcidId && candidate.orcid && profile.orcidId !== candidate.orcid) throw new ScholarlySyncError("所选 OpenAlex 作者与成员 ORCID 不一致", "ORCID_CONFLICT", 409);
      return { profile: await repository.verifyAuthor(userId, candidate.id, profile.orcidId ?? candidate.orcid, actorId, source), candidate };
    },
    async syncMember(userId: string, actorId: string, source: "admin" | "self" = "admin") {
      if (!(await repository.getProfile(userId))) throw new ScholarlySyncError("成员不存在", "NOT_FOUND", 404);
      return sync("manual_member", actorId, userId, source);
    },
    syncAll: (actorId: string | null, scheduled = false) => sync(scheduled ? "scheduled" : "manual_all", actorId),
    backfill: (actorId: string | null = null) => sync("backfill", actorId),
    listCandidates: (decision: "pending" | "ignored") => repository.listCandidates(decision),
    acceptWork: (workId: string, actorId: string) => acceptWork(workId, actorId),
    mergeWork,
    planBulk,
    bulkAccept,
    bulkIgnore,
    bulkMerge,
    ignoreWork: (workId: string, actorId: string) => decision(workId, "ignore", actorId),
    restoreWork: (workId: string, actorId: string) => decision(workId, "restore", actorId),
    status: async () => {
      const [repositoryStatus, enabled, providerConfig] = await Promise.all([repository.status(), resolveOption(options.enabled), resolveOption(options.providerConfig)]);
      options.openAlexStatus?.setConfigured(providerConfig.openAlexKeyConfigured);
      return { ...repositoryStatus, enabled, providers: { openAlex: options.openAlexStatus?.getStatus() ?? { configured: providerConfig.openAlexKeyConfigured, health: providerConfig.openAlexKeyConfigured ? "unknown" : "key_missing", checkedAt: null, lastSuccessAt: null, httpStatus: null, rateLimit: { limit: null, remaining: null, creditsUsed: null, resetSeconds: null, resetAt: null }, message: providerConfig.openAlexKeyConfigured ? "尚未检测 OpenAlex 状态" : "OpenAlex API Key 未配置" }, crossref: { configured: providerConfig.crossrefContactConfigured, health: providerConfig.crossrefContactConfigured ? "configured" : "contact_missing" } } };
    },
    async checkOpenAlexStatus(actorId: string) {
      const providerConfig = await resolveOption(options.providerConfig);
      options.openAlexStatus?.setConfigured(providerConfig.openAlexKeyConfigured);
      const status = options.openAlexStatus ? await options.openAlexStatus.check(openAlex, true) : null;
      await auditBulk(actorId, "scholarly.provider.check", { provider: "openalex", health: status?.health ?? "unknown", checkedAt: status?.checkedAt ?? null });
      return status;
    },
    async resetOpenAlexStatus() {
      const providerConfig = await resolveOption(options.providerConfig);
      options.openAlexStatus?.reset(providerConfig.openAlexKeyConfigured);
    },
    listRuns: () => repository.listRuns(),
    getResearchItemSyncInfo: (id: string) => repository.getResearchItemSyncInfo(id),
    async setManagedFields(id: string, fields: ManagedField[], actorId: string) {
      if (!(await repository.setManagedFields(id, fields, actorId))) throw new ScholarlySyncError("论文尚未绑定外部来源", "NOT_FOUND", 404);
      return repository.getResearchItemSyncInfo(id);
    },
    async resolveResearchItemSource(id: string, actorId: string, selectedOpenAlexWorkId?: string) {
      const item = await pool.query<{ title_en: string; title_zh: string }>("SELECT title_en,title_zh FROM research_items WHERE id=$1", [id]);
      if (!item.rowCount) throw new ScholarlySyncError("论文不存在", "NOT_FOUND", 404);
      const links = await pool.query<{ href: string }>("SELECT href FROM research_item_links WHERE research_item_id=$1 AND (lower(icon)='doi' OR href ~* '^(https?://(dx\\.)?doi\\.org/|doi:|10\\.)') ORDER BY sort_order LIMIT 1", [id]);
      const doi = normalizeDoi(links.rows[0]?.href);
      if (!doi && !selectedOpenAlexWorkId) {
        const title = item.rows[0].title_en || item.rows[0].title_zh;
        const candidates = await openAlex.searchWorks(title);
        return { candidates: candidates.map((candidate) => { const normalized = normalizeWork(candidate); return { openalexWorkId: normalized.openalexWorkId, doi: normalized.doi, title: normalized.title, year: normalized.year, venue: normalized.venue, authors: normalized.authors.map((author) => author.displayName) }; }) };
      }
      const openAlexWork = selectedOpenAlexWorkId ? await openAlex.getWork(selectedOpenAlexWorkId) : await openAlex.getWorkByDoi(doi!);
      let normalized = normalizeWork(openAlexWork);
      if (normalized.doi) try { normalized = normalizeWork(openAlexWork, await crossref.getWorkByDoi(normalized.doi)); } catch { /* best effort */ }
      const mapped = { ...normalized, mappedType: mapPublicationType(normalized.providerType) };
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const existing = await client.query<{ id: string; research_item_id: string | null; openalex_work_id: string | null }>("SELECT id,research_item_id,openalex_work_id FROM scholarly_works WHERE research_item_id=$1 OR openalex_work_id=$2 OR ($3::text IS NOT NULL AND doi_normalized=$3) FOR UPDATE", [id, mapped.openalexWorkId, mapped.doi]);
        const bound = existing.rows.find((row) => row.research_item_id === id);
        const provider = existing.rows.find((row) => row.openalex_work_id === mapped.openalexWorkId);
        if (provider?.research_item_id && provider.research_item_id !== id) throw new ScholarlySyncError("该 OpenAlex 成果已绑定另一篇论文", "SOURCE_CONFLICT", 409);
        if (bound && provider && bound.id !== provider.id) {
          await client.query("DELETE FROM scholarly_works WHERE id=$1", [bound.id]);
        }
        const workId = provider?.id ?? bound?.id;
        if (workId) await client.query("UPDATE scholarly_works SET source_type='manual',openalex_work_id=$2,doi_normalized=COALESCE(doi_normalized,$3),source_snapshot=$4::jsonb,provider_hash=$5,decision='accepted',research_item_id=$6,managed_fields=ARRAY[]::text[],last_seen_at=now(),last_synced_at=now(),reviewed_at=now(),reviewed_by=$7,version=version+1 WHERE id=$1", [workId, mapped.openalexWorkId, mapped.doi, JSON.stringify({ normalized: mapped, crossrefEnriched: true }), providerHash(normalized), id, actorId]);
        else await client.query("INSERT INTO scholarly_works(source_type,openalex_work_id,doi_normalized,decision,research_item_id,source_snapshot,managed_fields,provider_hash,last_seen_at,last_synced_at,reviewed_at,reviewed_by) VALUES('manual',$1,$2,'accepted',$3,$4::jsonb,ARRAY[]::text[],$5,now(),now(),now(),$6)", [mapped.openalexWorkId, mapped.doi, id, JSON.stringify({ normalized: mapped, crossrefEnriched: true }), providerHash(normalized), actorId]);
        await audit(client, actorId, "scholarly.source.resolve", "research_item", id, { openalexWorkId: mapped.openalexWorkId });
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
      return { sync: await repository.getResearchItemSyncInfo(id) };
    },
  };
}

export type ScholarlySyncService = ReturnType<typeof createScholarlySyncService>;
