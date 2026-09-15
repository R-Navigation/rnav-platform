"use client";

import { useCallback, useEffect, useState } from "react";
import { consoleApi } from "@/lib/consoleApi";
import { ConsoleAlert, ConsoleButton, ConsoleConfirmDialog, ConsoleInput, ConsoleSelect } from "@/features/console/ui";

type Profile = {
  userId: string; memberName: string; orcidId: string | null; openalexAuthorId: string | null;
  identityStatus: "unconfigured" | "pending" | "verified" | "conflict"; syncEnabled: boolean;
  syncFromYear: number | null; syncToYear: number | null; newWorkPolicy: "review" | "auto";
  verifiedAt: string | null; lastSyncedAt: string | null; lastSyncStatus: string | null; lastSyncMessage: string | null;
};
type Candidate = { id: string; displayName: string; orcid: string | null; institution: string; worksCount: number; recentWorks: Array<{ id: string; title: string; year: number | null }> };

export function ScholarlyProfileEditor({ userId, canEdit }: { userId: string; canEdit: boolean }) {
  const [profile, setProfile] = useState<Profile | null>(null), [draft, setDraft] = useState<Profile | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]), [institution, setInstitution] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState(""), [confirmSave, setConfirmSave] = useState(false);
  const load = useCallback(async () => { const result = await consoleApi<{ profile: Profile }>(`/api/scholarly-sync/members/${userId}`); setProfile(result.profile); setDraft(result.profile); setCandidates([]); }, [userId]);
  useEffect(() => { void load().catch((reason) => setError(reason instanceof Error ? reason.message : "无法加载学术档案")); }, [load]);
  const run = async (operation: () => Promise<void>, success: string) => { setBusy(true); setError(""); setMessage(""); try { await operation(); setMessage(success); } catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败"); } finally { setBusy(false); } };
  if (!draft) return <p className="text-sm text-slate-500">正在加载学术档案…</p>;
  const persist = () => run(async () => {
    const result = await consoleApi<{ profile: Profile }>(`/api/scholarly-sync/members/${userId}`, { method: "PATCH", body: JSON.stringify({ orcidId: draft.orcidId || null, syncEnabled: draft.syncEnabled, syncFromYear: draft.syncFromYear, syncToYear: draft.syncToYear, newWorkPolicy: draft.newWorkPolicy }) });
    setProfile(result.profile); setDraft(result.profile);
  }, "学术档案已保存。");
  const rangeText = `${draft.syncFromYear ?? "最早记录"} 年至 ${draft.syncToYear ?? "当前"}`;
  const rangeChanged = draft.syncFromYear !== profile?.syncFromYear || draft.syncToYear !== profile?.syncToYear;
  return <div className="space-y-5">
    <div><h3 className="text-lg font-bold text-blue-950">学术档案</h3><p className="mt-1 text-sm text-slate-500">ORCID 仅用于身份识别；自动同步始终使用管理员确认后的 OpenAlex Author ID。</p></div>
    {error ? <ConsoleAlert title="操作失败" tone="danger">{error}</ConsoleAlert> : null}
    {message ? <ConsoleAlert title="操作完成" tone="success">{message}</ConsoleAlert> : null}
    <div className="grid gap-4 md:grid-cols-2">
      <label className="text-sm font-semibold text-slate-700">ORCID<ConsoleInput className="mt-1" disabled={!canEdit || busy} placeholder="0000-0000-0000-0000" value={draft.orcidId ?? ""} onChange={(event) => setDraft({ ...draft, orcidId: event.target.value || null })}/></label>
      <label className="text-sm font-semibold text-slate-700">OpenAlex Author ID<ConsoleInput className="mt-1" disabled value={draft.openalexAuthorId ?? "尚未验证"}/></label>
      <label className="text-sm font-semibold text-slate-700">机构筛选（无 ORCID 时）<ConsoleInput className="mt-1" disabled={!canEdit || busy} placeholder="例如 Wuhan University" value={institution} onChange={(event) => setInstitution(event.target.value)}/></label>
      <label className="text-sm font-semibold text-slate-700">同步起始年份<ConsoleInput className="mt-1" disabled={!canEdit || busy} min="1900" max="2200" type="number" value={draft.syncFromYear ?? ""} onChange={(event) => setDraft({ ...draft, syncFromYear: event.target.value ? Number(event.target.value) : null })}/></label>
      <label className="text-sm font-semibold text-slate-700">同步结束年份<ConsoleInput className="mt-1" disabled={!canEdit || busy} min="1900" max="2200" type="number" value={draft.syncToYear ?? ""} onChange={(event) => setDraft({ ...draft, syncToYear: event.target.value ? Number(event.target.value) : null })}/></label>
      <label className="text-sm font-semibold text-slate-700">新论文处理<ConsoleSelect className="mt-1" disabled={!canEdit || busy} value={draft.newWorkPolicy} onChange={(event) => setDraft({ ...draft, newWorkPolicy: event.target.value as "review" | "auto" })}><option value="review">进入待确认队列</option><option value="auto">自动接收</option></ConsoleSelect></label>
      <label className="flex items-center gap-2 self-end rounded-lg border border-slate-200 p-3 text-sm font-semibold"><input checked={draft.syncEnabled} disabled={!canEdit || busy || draft.identityStatus !== "verified"} onChange={(event) => setDraft({ ...draft, syncEnabled: event.target.checked })} type="checkbox"/>启用自动同步</label>
    </div>
    <div className={`rounded-lg border p-4 text-sm text-blue-950 ${rangeChanged ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50"}`}><b>同步范围预览：{rangeText}</b><p className="mt-1">保存后，新同步将检查这一完整年份范围。修改范围不会删除已经导入或已人工处理的论文。</p>{draft.syncEnabled ? <p className="mt-1 font-semibold">自动同步已开启，请确认起止年份准确后再保存。</p> : null}</div>
    <div className="flex flex-wrap gap-2"><ConsoleButton disabled={!canEdit || busy} onClick={() => { if (rangeChanged || (!profile?.syncEnabled && draft.syncEnabled)) setConfirmSave(true); else void persist(); }} type="button" variant="primary">保存档案</ConsoleButton><ConsoleButton disabled={!canEdit || busy} onClick={() => void run(async () => { const result = await consoleApi<{ candidates: Candidate[] }>(`/api/scholarly-sync/members/${userId}/resolve`, { method: "POST", body: JSON.stringify({ orcidId: draft.orcidId || null, name: draft.memberName, institution: institution || undefined }) }); setCandidates(result.candidates); }, "已加载作者候选，请人工核对后确认。") } type="button">识别学术身份</ConsoleButton><ConsoleButton disabled={!canEdit || busy || !profile?.syncEnabled} onClick={() => void run(async () => { await consoleApi(`/api/scholarly-sync/members/${userId}/sync`, { method: "POST" }); await load(); }, "成员论文同步已完成。") } type="button">立即同步</ConsoleButton></div>
    {candidates.length ? <section className="space-y-3"><h4 className="font-bold text-blue-950">OpenAlex 作者候选</h4>{candidates.map((candidate) => <article className="rounded-lg border border-slate-200 p-4" key={candidate.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><strong className="text-blue-950">{candidate.displayName}</strong><p className="mt-1 text-xs text-slate-500">{candidate.id} · {candidate.orcid || "无 ORCID"} · {candidate.institution || "机构未标注"} · {candidate.worksCount} 篇成果</p></div><ConsoleButton disabled={busy || !canEdit} onClick={() => void run(async () => { const result = await consoleApi<{ profile: Profile }>(`/api/scholarly-sync/members/${userId}/verify-author`, { method: "POST", body: JSON.stringify({ openalexAuthorId: candidate.id }) }); setProfile(result.profile); setDraft(result.profile); setCandidates([]); }, "OpenAlex 作者身份已验证。") } size="sm" type="button" variant="primary">确认此作者</ConsoleButton></div><ul className="mt-3 space-y-1 text-xs text-slate-600">{candidate.recentWorks.map((work) => <li key={work.id}>{work.year || "年份未知"} · {work.title}</li>)}</ul></article>)}</section> : null}
    <section className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600"><b className="text-blue-950">同步状态：{draft.identityStatus === "verified" ? "身份已验证" : draft.identityStatus === "pending" ? "等待验证" : "未配置"}</b><p className="mt-2">最近同步：{draft.lastSyncedAt ? new Date(draft.lastSyncedAt).toLocaleString("zh-CN") : "尚未同步"}</p>{draft.lastSyncMessage ? <p className="mt-1">{draft.lastSyncStatus} · {draft.lastSyncMessage}</p> : null}</section>
    <ConsoleConfirmDialog description={`当前设置将同步 ${rangeText} 的全部成果。系统不会因为修改年份而删除现有论文；如需清理错误首次同步，必须使用受控运维脚本。`} onClose={()=>setConfirmSave(false)} onConfirm={()=>{setConfirmSave(false);void persist();}} open={confirmSave} title="确认论文同步范围" confirmLabel="确认并保存"/>
  </div>;
}
