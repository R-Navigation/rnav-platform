import { consoleApi } from "@/lib/consoleApi";

export type PublicationSyncInfo = {
  id?: string; source_type: "manual" | "openalex"; openalex_work_id?: string | null; doi_normalized?: string | null;
  decision: "pending" | "accepted" | "ignored"; managed_fields: string[]; provider_updated_at?: string | null; last_synced_at?: string | null;
};
export type PublicationCandidate = {
  id: string; decision: "pending" | "ignored"; openalex_work_id: string; doi_normalized: string | null;
  sourceSnapshot: { normalized?: { title?: string; year?: number | null; venue?: string; authors?: Array<{ displayName?: string }>; mappedType?: string }; possibleDuplicateResearchItemId?: string };
  members: Array<{ userId: string; name: string; position: number | null }>;
  first_seen_at: string;
};
export type ScholarlyStatus = {
  enabled: boolean;
  providers?: { openAlexKeyConfigured?: boolean; crossrefContactConfigured?: boolean };
  profiles?: { verified?: number; enabled?: number; total?: number };
  pending?: number; ignored?: number;
  lastRun?: { started_at?: string; status?: string; works_seen?: number; candidates_created?: number; works_updated?: number; failures?: number } | null;
};
export type PublicationSourceCandidate = { openalexWorkId: string; doi: string | null; title: string; year: number | null; venue: string; authors: string[] };

export const scholarlyApi = {
  status: () => consoleApi<ScholarlyStatus>("/api/scholarly-sync/status"),
  candidates: (status: "pending" | "ignored") => consoleApi<{ candidates: PublicationCandidate[] }>(`/api/scholarly-sync/candidates?status=${status}`),
  syncAll: () => consoleApi("/api/scholarly-sync/sync-all", { method: "POST" }),
  accept: (id: string) => consoleApi(`/api/scholarly-sync/works/${id}/accept`, { method: "POST" }),
  merge: (id: string, researchItemId: string) => consoleApi(`/api/scholarly-sync/works/${id}/merge`, { method: "POST", body: JSON.stringify({ researchItemId }) }),
  ignore: (id: string) => consoleApi(`/api/scholarly-sync/works/${id}/ignore`, { method: "POST" }),
  restore: (id: string) => consoleApi(`/api/scholarly-sync/works/${id}/restore`, { method: "POST" }),
  info: (id: string) => consoleApi<{ sync: PublicationSyncInfo }>(`/api/scholarly-sync/research-items/${encodeURIComponent(id)}`),
  managedFields: (id: string, managedFields: string[]) => consoleApi<{ sync: PublicationSyncInfo }>(`/api/scholarly-sync/research-items/${encodeURIComponent(id)}/managed-fields`, { method: "PATCH", body: JSON.stringify({ managedFields }) }),
  resolveSource: (id: string, openalexWorkId?: string) => consoleApi<{ sync?: PublicationSyncInfo; candidates?: PublicationSourceCandidate[] }>(`/api/scholarly-sync/research-items/${encodeURIComponent(id)}/resolve-source`, { method: "POST", body: JSON.stringify(openalexWorkId ? { openalexWorkId } : {}) }),
};
