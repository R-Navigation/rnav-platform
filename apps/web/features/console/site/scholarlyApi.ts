import { consoleApi } from "@/lib/consoleApi";

export type PublicationSyncInfo = {
  id?: string; source_type: "manual" | "openalex"; openalex_work_id?: string | null; doi_normalized?: string | null;
  decision: "pending" | "accepted" | "ignored"; managed_fields: string[]; provider_updated_at?: string | null; last_synced_at?: string | null;
};
export type PublicationCandidate = {
  id: string; decision: "pending" | "ignored"; openalex_work_id: string; doi_normalized: string | null;
  sourceSnapshot: { normalized?: { title?: string; year?: number | null; venue?: string; authors?: Array<{ displayName?: string }>; mappedType?: string }; possibleDuplicateResearchItemId?: string };
  members: Array<{ userId: string; name: string; position: number | null }>;
  first_seen_at: string; risk: "safe" | "possible_duplicate" | "high_confidence_duplicate";
  duplicateSuggestion: null | { researchItemId: string; title: string; year: number | null; venue: string; authors: string[]; confidence: "high" | "possible"; authorOverlap: number };
};
export type ProviderStatus = { configured: boolean; health: "healthy" | "key_missing" | "auth_error" | "budget_exhausted" | "rate_limited" | "timeout" | "provider_error" | "unknown"; checkedAt: string | null; lastSuccessAt: string | null; httpStatus: number | null; rateLimit: { limit: number | null; remaining: number | null; creditsUsed: number | null; resetSeconds: number | null; resetAt: string | null }; message: string };
export type ScholarlyStatus = {
  enabled: boolean;
  providers?: { openAlex?: ProviderStatus; crossref?: { configured: boolean; health: string } };
  profiles?: { verified?: number; enabled?: number; total?: number };
  pending?: number; ignored?: number;
  lastRun?: { started_at?: string; status?: string; works_seen?: number; candidates_created?: number; works_updated?: number; failures?: number } | null;
};
export type PublicationSourceCandidate = { openalexWorkId: string; doi: string | null; title: string; year: number | null; venue: string; authors: string[] };
export type BulkPlan = { requested: number; counts: Record<"safe_accept" | "suggested_merge" | "already_accepted" | "needs_review" | "conflict", number>; items: Array<{ workId: string; action: string; reason: string; suggestedResearchItemId?: string }> };
export type BulkResult = { requested: number; accepted?: number; ignored?: number; merged?: number; alreadyAccepted?: number; alreadyIgnored?: number; alreadyMerged?: number; skipped?: number; failed: number; results: Array<{ workId: string; status: string; error?: string }> };

export const scholarlyApi = {
  status: () => consoleApi<ScholarlyStatus>("/api/scholarly-sync/status"),
  candidates: (status: "pending" | "ignored") => consoleApi<{ candidates: PublicationCandidate[] }>(`/api/scholarly-sync/candidates?status=${status}`),
  syncAll: () => consoleApi("/api/scholarly-sync/sync-all", { method: "POST" }),
  checkOpenAlex: () => consoleApi<{ provider: ProviderStatus | null }>("/api/scholarly-sync/providers/openalex/check", { method: "POST" }),
  accept: (id: string) => consoleApi(`/api/scholarly-sync/works/${id}/accept`, { method: "POST" }),
  merge: (id: string, researchItemId: string) => consoleApi(`/api/scholarly-sync/works/${id}/merge`, { method: "POST", body: JSON.stringify({ researchItemId }) }),
  ignore: (id: string) => consoleApi(`/api/scholarly-sync/works/${id}/ignore`, { method: "POST" }),
  restore: (id: string) => consoleApi(`/api/scholarly-sync/works/${id}/restore`, { method: "POST" }),
  bulkPlan: (workIds: string[]) => consoleApi<BulkPlan>("/api/scholarly-sync/bulk/plan", { method: "POST", body: JSON.stringify({ workIds }) }),
  bulkAccept: (workIds: string[]) => consoleApi<BulkResult>("/api/scholarly-sync/bulk/accept", { method: "POST", body: JSON.stringify({ workIds }) }),
  bulkIgnore: (workIds: string[]) => consoleApi<BulkResult>("/api/scholarly-sync/bulk/ignore", { method: "POST", body: JSON.stringify({ workIds }) }),
  bulkMerge: (items: Array<{ workId: string; researchItemId: string }>) => consoleApi<BulkResult>("/api/scholarly-sync/bulk/merge", { method: "POST", body: JSON.stringify({ items }) }),
  info: (id: string) => consoleApi<{ sync: PublicationSyncInfo }>(`/api/scholarly-sync/research-items/${encodeURIComponent(id)}`),
  managedFields: (id: string, managedFields: string[]) => consoleApi<{ sync: PublicationSyncInfo }>(`/api/scholarly-sync/research-items/${encodeURIComponent(id)}/managed-fields`, { method: "PATCH", body: JSON.stringify({ managedFields }) }),
  resolveSource: (id: string, openalexWorkId?: string) => consoleApi<{ sync?: PublicationSyncInfo; candidates?: PublicationSourceCandidate[] }>(`/api/scholarly-sync/research-items/${encodeURIComponent(id)}/resolve-source`, { method: "POST", body: JSON.stringify(openalexWorkId ? { openalexWorkId } : {}) }),
};
