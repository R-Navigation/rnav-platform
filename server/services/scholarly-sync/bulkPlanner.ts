export type BulkPlanAction = "safe_accept" | "suggested_merge" | "already_accepted" | "needs_review" | "conflict";
export type BulkPlanItem = {
  workId: string; action: BulkPlanAction; reason: string; suggestedResearchItemId?: string;
};

type Candidate = {
  id: unknown; decision?: unknown; sourceSnapshot?: { normalized?: unknown } | null;
  duplicateSuggestion?: { researchItemId?: string; confidence?: string } | null;
};

export function createBulkPlan(workIds: string[], candidates: Candidate[]) {
  const byId = new Map(candidates.map((candidate) => [String(candidate.id), candidate]));
  const items: BulkPlanItem[] = workIds.map((workId) => {
    const candidate = byId.get(workId);
    if (!candidate) return { workId, action: "conflict", reason: "候选论文不存在或已被清理" };
    if (candidate.decision === "accepted") return { workId, action: "already_accepted", reason: "已经接收" };
    if (candidate.decision !== "pending") return { workId, action: "needs_review", reason: "当前状态不是待确认" };
    if (!candidate.sourceSnapshot?.normalized) return { workId, action: "conflict", reason: "缺少可用的规范化元数据" };
    if (candidate.duplicateSuggestion?.researchItemId) return {
      workId, action: "suggested_merge", reason: candidate.duplicateSuggestion.confidence === "high" ? "标题、年份与作者均有重合，建议合并" : "标题与年份相同，需人工确认",
      suggestedResearchItemId: candidate.duplicateSuggestion.researchItemId,
    };
    return { workId, action: "safe_accept", reason: "未发现已有论文冲突" };
  });
  const counts = items.reduce<Record<BulkPlanAction, number>>((result, item) => ({ ...result, [item.action]: result[item.action] + 1 }), { safe_accept: 0, suggested_merge: 0, already_accepted: 0, needs_review: 0, conflict: 0 });
  return { requested: workIds.length, counts, items };
}
