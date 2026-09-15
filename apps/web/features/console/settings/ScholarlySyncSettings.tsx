"use client";

import { useEffect, useMemo, useState } from "react";
import { consoleApi } from "@/lib/consoleApi";
import { ConsoleAlert, ConsoleButton, ConsoleCard, ConsoleConfirmDialog, ConsoleInput, ConsoleSearchInput, ConsoleSelect, ConsoleStatusBadge, ConsoleTable, ConsoleTableWrap } from "@/features/console/ui";

type Member = {
  userId: string; username: string; memberName: string; orcidId: string | null; openalexAuthorId: string | null;
  identityStatus: "unconfigured" | "pending" | "verified" | "conflict"; syncEnabled: boolean;
  syncFromYear: number | null; syncToYear: number | null; newWorkPolicy: "auto" | "review";
  autoEligible: boolean; autoDisabledReason: string | null; syncDisabledReason: string | null;
};
type OpenAlexState = {
  configured: boolean; health: string; checkedAt: string | null; message: string;
  rateLimit: { limit: number | null; remaining: number | null; creditsUsed: number | null; resetAt: string | null };
};
type Overview = {
  settings: { enabled: boolean; crossrefContactEmail: string; version: number; updatedAt: string | null; source: "database" | "environment"; openAlexApiKey: { configured: boolean; masked: string | null; version: number } };
  members: Member[];
  lastScheduledRun: { status: string; started_at: string; finished_at: string | null; members_checked: number; works_seen: number; candidates_created: number; works_updated: number; failures: number } | null;
  status: { providers: { openAlex: OpenAlexState; crossref: { configured: boolean; health: string } } };
};

const identityLabels = { unconfigured: "未配置", pending: "待验证", verified: "已验证", conflict: "有冲突" };
const identityTones = { unconfigured: "neutral", pending: "warning", verified: "success", conflict: "danger" } as const;
const statusTone = (health: string) => health === "healthy" ? "success" : health === "unknown" || health === "configured" ? "neutral" : "warning";
const formatTime = (value: string | null | undefined) => value ? new Date(value).toLocaleString("zh-CN") : "尚无记录";

export function ScholarlySyncSettings() {
  const [data, setData] = useState<Overview | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [email, setEmail] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<"enable_sync" | "review_all" | null>(null);

  const apply = (next: Overview) => { setData(next); setEnabled(next.settings.enabled); setEmail(next.settings.crossrefContactEmail); };
  const load = async () => { setError(""); try { apply(await consoleApi<Overview>("/api/settings/scholarly-sync")); } catch (cause) { setError((cause as Error).message); } };
  useEffect(() => {
    let active = true;
    consoleApi<Overview>("/api/settings/scholarly-sync").then((next) => {
      if (!active) return;
      setData(next); setEnabled(next.settings.enabled); setEmail(next.settings.crossrefContactEmail);
    }).catch((cause) => { if (active) setError((cause as Error).message); });
    return () => { active = false; };
  }, []);
  const members = useMemo(() => data?.members.filter((member) => `${member.memberName} ${member.username} ${member.orcidId ?? ""} ${member.openalexAuthorId ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())) ?? [], [data, query]);

  async function saveGlobal() {
    if (!data) return;
    setBusy("global"); setError(""); setMessage("");
    try {
      const payload: Record<string, unknown> = { enabled, crossrefContactEmail: email, version: data.settings.version };
      if (apiKey.trim()) payload.openAlexApiKey = apiKey.trim();
      apply(await consoleApi<Overview>("/api/settings/scholarly-sync", { method: "PUT", body: JSON.stringify(payload) }));
      setApiKey(""); setMessage("学术同步全局设置已保存并生效。");
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(""); }
  }
  async function detectOpenAlex() {
    setBusy("detect"); setError(""); setMessage("");
    try {
      const result = await consoleApi<{ status: OpenAlexState }>("/api/settings/scholarly-sync/openalex/check", { method: "POST", body: "{}" });
      setData((current) => current ? { ...current, status: { ...current.status, providers: { ...current.status.providers, openAlex: result.status } } } : current);
      setMessage(result.status.message);
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(""); }
  }
  async function updateMember(member: Member, patch: Partial<Pick<Member, "syncEnabled" | "newWorkPolicy">>) {
    setBusy(member.userId); setError(""); setMessage("");
    try {
      const result = await consoleApi<{ member: Member }>(`/api/settings/scholarly-sync/members/${member.userId}`, { method: "PATCH", body: JSON.stringify(patch) });
      setData((current) => current ? { ...current, members: current.members.map((item) => item.userId === member.userId ? result.member : item) } : current);
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(""); }
  }
  async function bulk(operation: "enable_sync" | "review_all") {
    setConfirm(null); setBusy("bulk"); setError(""); setMessage("");
    try {
      const result = await consoleApi<{ requested: number; eligible: number; updated: number; skipped: number }>("/api/settings/scholarly-sync/members/bulk", { method: "POST", body: JSON.stringify({ operation }) });
      await load();
      setMessage(operation === "enable_sync" ? `已为 ${result.updated} 位成员开启自动同步，${result.skipped} 位因身份未验证而跳过。` : `已将 ${result.updated} 位成员改为人工审核。`);
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(""); }
  }

  if (!data && !error) return <ConsoleCard className="p-8 text-sm text-slate-500">正在加载学术同步设置…</ConsoleCard>;
  if (!data) return <ConsoleCard className="p-5"><ConsoleAlert tone="danger">{error}</ConsoleAlert><ConsoleButton className="mt-4" onClick={() => void load()}>重新加载</ConsoleButton></ConsoleCard>;
  const openAlex = data.status.providers.openAlex;
  const run = data.lastScheduledRun;
  return <div className="space-y-5">
    {error ? <ConsoleAlert tone="danger">{error}</ConsoleAlert> : null}
    {message ? <ConsoleAlert tone="success">{message}</ConsoleAlert> : null}
    <ConsoleCard className="overflow-hidden">
      <header className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold text-slate-950">学术同步</h2><p className="mt-1 text-sm text-slate-500">管理 OpenAlex、Crossref 与全局同步开关。API Key 不会在页面或接口中明文显示。</p></header>
      <div className="grid gap-6 p-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="space-y-5">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"><input checked={enabled} className="mt-0.5 size-4" onChange={(event) => setEnabled(event.target.checked)} type="checkbox"/><span><span className="block text-sm font-semibold text-slate-800">启用 Scholarly Sync</span><span className="mt-1 block text-xs text-slate-500">关闭后，手动与定时同步都会停止；已有论文和候选记录不受影响。</span></span></label>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block"><span className="text-sm font-semibold text-slate-700">OpenAlex API Key</span><span className="mt-1 block text-xs text-slate-500">当前：{data.settings.openAlexApiKey.configured ? `已配置（${data.settings.openAlexApiKey.masked}）` : "未配置"}</span><ConsoleInput autoComplete="new-password" className="mt-2" onChange={(event) => setApiKey(event.target.value)} placeholder="留空则保持现有 Key" type="password" value={apiKey}/></label>
            <label className="block"><span className="text-sm font-semibold text-slate-700">Crossref 联系邮箱</span><span className="mt-1 block text-xs text-slate-500">用于 Crossref polite pool 请求标识。</span><ConsoleInput className="mt-2" onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" type="email" value={email}/></label>
          </div>
        </div>
        <aside className="border-t border-slate-200 pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
          <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-slate-800">OpenAlex 当前状态</p><ConsoleStatusBadge tone={statusTone(openAlex.health)}>{openAlex.configured ? openAlex.health : "未配置"}</ConsoleStatusBadge></div>
          <p className="mt-2 text-xs leading-5 text-slate-500">{openAlex.message}</p>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs"><div><dt className="text-slate-500">剩余额度</dt><dd className="mt-1 font-semibold text-slate-800">{openAlex.rateLimit.remaining ?? "未知"}{openAlex.rateLimit.limit != null ? ` / ${openAlex.rateLimit.limit}` : ""}</dd></div><div><dt className="text-slate-500">重置时间</dt><dd className="mt-1 font-semibold text-slate-800">{formatTime(openAlex.rateLimit.resetAt)}</dd></div><div className="col-span-2"><dt className="text-slate-500">检测时间</dt><dd className="mt-1 font-semibold text-slate-800">{formatTime(openAlex.checkedAt)}</dd></div></dl>
          <ConsoleButton className="mt-4 w-full" disabled={busy === "detect" || !openAlex.configured} onClick={() => void detectOpenAlex()}>{busy === "detect" ? "检测中…" : "检测 OpenAlex"}</ConsoleButton>
        </aside>
      </div>
      <footer className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-500">配置来源：{data.settings.source === "database" ? "后台设置" : "服务器环境变量（尚未保存后台设置）"} · 上次修改 {formatTime(data.settings.updatedAt)}</p><ConsoleButton disabled={busy === "global"} onClick={() => void saveGlobal()} variant="primary">{busy === "global" ? "保存中…" : "保存全局设置"}</ConsoleButton></footer>
    </ConsoleCard>

    <ConsoleCard className="px-5 py-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-slate-950">最近一次自动同步</h2><p className="mt-1 text-sm text-slate-500">{run ? `${formatTime(run.finished_at || run.started_at)} · ${run.status}` : "尚无定时同步记录"}</p></div>{run ? <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600"><span>成员 {run.members_checked}</span><span>发现 {run.works_seen}</span><span>新增候选 {run.candidates_created}</span><span>更新 {run.works_updated}</span><span>失败 {run.failures}</span></div> : null}</div></ConsoleCard>

    <ConsoleCard className="overflow-hidden">
      <header className="border-b border-slate-100 px-5 py-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h2 className="font-semibold text-slate-950">成员自动同步设置</h2><p className="mt-1 text-sm text-slate-500">仅显示成员账号。自动接受要求 OpenAlex 身份已验证，并设置完整、有效的同步年份范围。</p></div><div className="flex flex-col gap-2 sm:flex-row"><ConsoleButton disabled={busy === "bulk"} onClick={() => setConfirm("enable_sync")} size="sm">全部开启自动同步</ConsoleButton><ConsoleButton disabled={busy === "bulk"} onClick={() => setConfirm("review_all")} size="sm">全部改为人工审核</ConsoleButton></div></div><ConsoleSearchInput aria-label="搜索成员" className="mt-4 max-w-md" onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名、用户名、ORCID 或 OpenAlex ID" value={query}/></header>
      <div className="p-5"><ConsoleTableWrap><ConsoleTable><thead><tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500"><th className="px-4 py-3 font-semibold">成员</th><th className="px-4 py-3 font-semibold">学术身份</th><th className="px-4 py-3 font-semibold">同步年份</th><th className="px-4 py-3 font-semibold">自动同步</th><th className="px-4 py-3 font-semibold">新论文策略</th></tr></thead><tbody>{members.map((member) => <tr className="border-b border-slate-100 last:border-0" key={member.userId}><td className="px-4 py-3"><p className="font-semibold text-slate-900">{member.memberName}</p><p className="mt-0.5 text-xs text-slate-500">{member.username}</p></td><td className="px-4 py-3"><ConsoleStatusBadge tone={identityTones[member.identityStatus]}>{identityLabels[member.identityStatus]}</ConsoleStatusBadge><p className="mt-1 max-w-56 truncate text-xs text-slate-500" title={member.orcidId || member.openalexAuthorId || ""}>{member.orcidId || member.openalexAuthorId || "未绑定 ORCID / OpenAlex"}</p></td><td className="px-4 py-3 text-slate-700">{member.syncFromYear ?? "—"} 至 {member.syncToYear ?? "—"}</td><td className="px-4 py-3"><label className="inline-flex items-center gap-2 text-sm text-slate-700" title={member.syncDisabledReason ?? undefined}><input checked={member.syncEnabled} disabled={busy === member.userId || Boolean(member.syncDisabledReason)} onChange={(event) => void updateMember(member, { syncEnabled: event.target.checked })} type="checkbox"/>启用</label>{member.syncDisabledReason ? <p className="mt-1 max-w-52 text-xs leading-4 text-amber-700">{member.syncDisabledReason}</p> : null}</td><td className="px-4 py-3"><ConsoleSelect aria-label={`${member.memberName}的新论文策略`} className="w-40" disabled={busy === member.userId} onChange={(event) => void updateMember(member, { newWorkPolicy: event.target.value as "auto" | "review" })} value={member.newWorkPolicy}><option value="review">人工审核</option><option disabled={!member.autoEligible} value="auto">自动接受</option></ConsoleSelect>{member.autoDisabledReason ? <p className="mt-1 max-w-52 text-xs leading-4 text-amber-700">{member.autoDisabledReason}</p> : null}</td></tr>)}</tbody></ConsoleTable></ConsoleTableWrap>{!members.length ? <p className="py-8 text-center text-sm text-slate-500">没有匹配的成员账号。</p> : null}</div>
    </ConsoleCard>
    <ConsoleConfirmDialog description="系统只会为 OpenAlex 身份已验证的成员开启自动同步；未验证成员会被跳过。新论文仍沿用每位成员当前的审核策略。" onClose={() => setConfirm(null)} onConfirm={() => void bulk("enable_sync")} open={confirm === "enable_sync"} title="为全部合格成员开启自动同步？" confirmLabel="确认开启"/>
    <ConsoleConfirmDialog description="所有已配置学术档案的成员都会改为人工审核。之后发现的新论文将进入 Pending，已有论文不会改变。" onClose={() => setConfirm(null)} onConfirm={() => void bulk("review_all")} open={confirm === "review_all"} title="将全部成员改为人工审核？" confirmLabel="确认修改"/>
  </div>;
}
