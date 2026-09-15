"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ConsoleApiError, consoleApi } from "@/lib/consoleApi";
import { MediaPicker } from "@/features/console/ui/MediaPicker";
import { academicStageLabels, publicProfileFieldGroups, type AcademicStage } from "@/features/console/members/profileModel";
import { personIdentityFromChineseName } from "@/features/console/members/memberIdentity";
import { ScholarlyProfileForm } from "@/features/console/scholarly/ScholarlyProfileForm";

type PersonalLink = { labelZh: string; labelEn: string; url: string };
type Profile = {
  version: number; username: string; accountKind: "person" | "system"; memberStatus: "current" | "alumni"; academicStage: AcademicStage;
  publicVisible: boolean; nameZh: string; nameEn: string; publicEmail: string; phone: string; bioZh: string; bioEn: string;
  researchInterestsZh: string; researchInterestsEn: string; enrollmentYear: string; graduationYear: string;
  majorZh: string; majorEn: string; thesisZh: string; thesisEn: string; destinationZh: string; destinationEn: string;
  avatarAssetId: string | null; avatarUrl: string | null; avatarPositionX: number; avatarPositionY: number;
  avatarZoom: number; personalLinks: PersonalLink[]; publicFields: string[];
};

const input = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100";
type Tab = "profile" | "public" | "scholarly" | "security";
const personTabs: ReadonlyArray<readonly [Tab, string]> = [["profile", "个人资料"], ["public", "公开展示"], ["scholarly", "学术档案"], ["security", "账号安全"]];
const systemTabs: ReadonlyArray<readonly [Tab, string]> = [["profile", "个人资料"], ["public", "公开展示"], ["security", "账号安全"]];

export function ProfileConsole({ mustChangePassword }: { mustChangePassword: boolean }) {
  const params = useSearchParams(), router = useRouter();
  const requestedSection = params.get("section");
  const initial: Tab = mustChangePassword ? "security" : requestedSection === "security" || requestedSection === "public" || requestedSection === "scholarly" ? requestedSection : "profile";
  const [tab, setTab] = useState<Tab>(initial), [profile, setProfile] = useState<Profile | null>(null), [draft, setDraft] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  useEffect(() => { if (!mustChangePassword) consoleApi<Profile>("/api/profile").then((value) => { setProfile(value); setDraft(value); }).catch((reason) => setError(reason.message)); }, [mustChangePassword]);
  const visible = useMemo(() => new Set(draft?.publicFields ?? []), [draft]);
  const update = <K extends keyof Profile>(key: K, value: Profile[K]) => setDraft((current) => current ? { ...current, [key]: value } : current);
  const updateIdentity = (nameZh: string) => setDraft((current) => {
    if (!current) return current;
    if (current.accountKind !== "person") return { ...current, nameZh };
    const identity = personIdentityFromChineseName(nameZh);
    return { ...current, nameZh, nameEn: identity?.nameEn ?? "", username: identity?.username ?? current.username };
  });
  const switchTab = (next: Tab) => { if (mustChangePassword && next !== "security") return; setTab(next); router.replace(`/console/profile?section=${next}`, { scroll: false }); };
  useEffect(() => { if (draft?.accountKind === "system" && tab === "scholarly") { setTab("profile"); router.replace("/console/profile?section=profile", { scroll: false }); } }, [draft?.accountKind, router, tab]);

  async function save() {
    if (!draft) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const body = {
        version: draft.version,
        nameZh: draft.nameZh, nameEn: draft.nameEn, publicEmail: draft.publicEmail, phone: draft.phone,
        bioZh: draft.bioZh, bioEn: draft.bioEn, researchInterestsZh: draft.researchInterestsZh,
        researchInterestsEn: draft.researchInterestsEn, enrollmentYear: draft.enrollmentYear,
        graduationYear: draft.graduationYear, majorZh: draft.majorZh, majorEn: draft.majorEn,
        thesisZh: draft.thesisZh, thesisEn: draft.thesisEn, destinationZh: draft.destinationZh,
        destinationEn: draft.destinationEn, avatarAssetId: draft.avatarAssetId,
        avatarPositionX: draft.avatarPositionX, avatarPositionY: draft.avatarPositionY,
        avatarZoom: draft.avatarZoom,
        personalLinks: draft.personalLinks, publicFields: draft.publicFields,
      };
      const saved = await consoleApi<Profile>("/api/profile", { method: "PUT", body: JSON.stringify(body) });
      setProfile(saved); setDraft(saved); setMessage("个人资料已保存。公开成员页会按照你的展示设置更新。");
    } catch (reason) {
      setError(reason instanceof ConsoleApiError && reason.code === "VERSION_CONFLICT" ? "资料已被其他操作更新，请重新加载页面后再编辑。" : (reason as Error).message);
    } finally { setBusy(false); }
  }

  async function uploadAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const data = new FormData(); data.append("file", file);
      const asset = await consoleApi<{ id: string; url: string }>("/api/media/upload", { method: "POST", body: data });
      setDraft((current) => current ? {
        ...current,
        avatarAssetId: asset.id,
        avatarUrl: asset.url,
        avatarPositionX: 50,
        avatarPositionY: 50,
        avatarZoom: 1,
      } : current);
      setMessage("照片已上传，可调整显示区域，然后点击保存资料完成替换。");
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); event.target.value = ""; }
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form), current = String(data.get("currentPassword") ?? ""), next = String(data.get("newPassword") ?? ""), confirm = String(data.get("confirmPassword") ?? "");
    if (next.length < 8) { setError("新密码至少需要 8 个字符。"); return; }
    if (next !== confirm) { setError("两次输入的新密码不一致。"); return; }
    setBusy(true); setError(""); setMessage("");
    try { await consoleApi("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword: current, newPassword: next }) }); form.reset(); if (mustChangePassword) { router.replace("/console"); router.refresh(); return; } setMessage("密码已修改，其他登录会话已失效。"); router.refresh(); }
    catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }

  if (mustChangePassword) return <PasswordForm busy={busy} error={error} onSubmit={changePassword} requiredChange />;
  if (error && !draft) return <div className="border border-red-200 bg-red-50 p-5 text-sm text-red-800">{error}</div>;
  if (!draft) return <p className="text-sm text-slate-600">正在加载个人资料...</p>;
  const alumni = draft.memberStatus === "alumni";
  const tabs = draft.accountKind === "person" ? personTabs : systemTabs;
  return <section className="max-w-5xl">
    <div><p className="text-xs font-semibold text-cyan-800">账号与公开身份</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">个人资料</h1><p className="mt-2 text-sm text-slate-600">管理员决定账号是否列入官网；列入后，具体展示内容由你自己控制。</p></div>
    <div className="mt-7 flex border-b border-slate-200" role="tablist">{tabs.map(([key, label]) => <button className={`px-4 py-3 text-sm font-semibold ${tab === key ? "border-b-2 border-cyan-700 text-cyan-800" : "text-slate-600"}`} key={key} onClick={() => switchTab(key)}>{label}</button>)}</div>
    {message ? <p className="mt-5 border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}
    {error ? <p className="mt-5 border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
    {tab === "profile" ? <div className="mt-7 space-y-8">
      <section className="grid gap-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-[160px_1fr]">
        <div>{draft.avatarUrl ? <AvatarPreview alt="个人照片预览" className="w-40" profile={draft} /> : <div className="grid aspect-square w-40 place-items-center bg-slate-100 text-sm text-slate-500">尚未上传照片</div>}</div>
        <div><h2 className="font-semibold text-blue-950">个人照片</h2><p className="mt-2 text-sm text-slate-600">支持 JPG、PNG、WebP。重新上传并保存后，原照片若未被其他业务引用会进入回收站。</p><div className="mt-4 flex flex-wrap gap-3"><label className="cursor-pointer rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white">{draft.avatarUrl ? "重新上传" : "上传照片"}<input accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={uploadAvatar} type="file" /></label><button className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700" onClick={() => setMediaPickerOpen(true)} type="button">从资源库选择</button>{draft.avatarAssetId ? <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm" onClick={() => { update("avatarAssetId", null); update("avatarUrl", null); }} type="button">移除照片</button> : null}</div>{draft.avatarUrl ? <div className="mt-5 grid gap-4 sm:grid-cols-3"><Range label="水平位置" max={100} min={0} onChange={(value) => update("avatarPositionX", value)} value={draft.avatarPositionX} /><Range label="垂直位置" max={100} min={0} onChange={(value) => update("avatarPositionY", value)} value={draft.avatarPositionY} /><Range label="缩放" max={3} min={1} onChange={(value) => update("avatarZoom", value)} step={0.05} value={draft.avatarZoom} /></div> : null}</div>
      </section>
      <div className="grid gap-5 sm:grid-cols-2"><ReadOnly label="用户名（中文姓名全拼，姓在前）" value={draft.username} /><ReadOnly label="成员状态（由管理员维护）" value={draft.memberStatus === "alumni" ? "校友" : "在组"} />
        <TextField label="中文姓名" value={draft.nameZh} onChange={updateIdentity} />
        {draft.accountKind === "person" ? <ReadOnly label="英文姓名（名-姓，自动生成）" value={draft.nameEn} /> : <TextField label="英文姓名" value={draft.nameEn} onChange={(value) => update("nameEn", value)} />}
        <TextField label={alumni ? "毕业年份" : "入学年份"} placeholder="例如 2024" value={alumni ? draft.graduationYear : draft.enrollmentYear} onChange={(value) => update(alumni ? "graduationYear" : "enrollmentYear", value)} />
        <ReadOnly label="学术身份（由管理员维护）" value={academicStageLabels[draft.academicStage]} />
        <TextField label="中文专业" value={draft.majorZh} onChange={(value) => update("majorZh", value)} /><TextField label="英文专业" value={draft.majorEn} onChange={(value) => update("majorEn", value)} />
        <TextField label="公开联系邮箱（可独立选择官网展示）" value={draft.publicEmail} onChange={(value) => update("publicEmail", value)} /><TextField label="联系电话（可独立选择官网展示）" value={draft.phone} onChange={(value) => update("phone", value)} />
        <TextArea label="中文研究方向" value={draft.researchInterestsZh} onChange={(value) => update("researchInterestsZh", value)} /><TextArea label="英文研究方向" value={draft.researchInterestsEn} onChange={(value) => update("researchInterestsEn", value)} />
        <TextArea label="中文个人简介" value={draft.bioZh} onChange={(value) => update("bioZh", value)} /><TextArea label="英文个人简介" value={draft.bioEn} onChange={(value) => update("bioEn", value)} />
        {alumni ? <><TextArea label="中文毕业设计题目" value={draft.thesisZh} onChange={(value) => update("thesisZh", value)} /><TextArea label="英文毕业设计题目" value={draft.thesisEn} onChange={(value) => update("thesisEn", value)} /><TextField label="中文去向单位" value={draft.destinationZh} onChange={(value) => update("destinationZh", value)} /><TextField label="英文去向单位" value={draft.destinationEn} onChange={(value) => update("destinationEn", value)} /></> : null}
      </div>
      <section><div className="flex items-center justify-between"><div><h2 className="font-semibold text-blue-950">个人链接</h2><p className="mt-1 text-sm text-slate-600">可添加个人主页、GitHub、Google Scholar 或其他公开链接。</p></div><button className="border border-slate-300 px-3 py-2 text-sm" onClick={() => update("personalLinks", [...draft.personalLinks, { labelZh: "", labelEn: "", url: "" }])} type="button">新增链接</button></div><div className="mt-4 space-y-4">{draft.personalLinks.map((link, index) => <div className="grid gap-3 border border-slate-200 p-4 md:grid-cols-[1fr_1fr_2fr_auto]" key={index}><input className={input} placeholder="中文标签" value={link.labelZh} onChange={(event) => update("personalLinks", draft.personalLinks.map((item, itemIndex) => itemIndex === index ? { ...item, labelZh: event.target.value } : item))} /><input className={input} placeholder="English label" value={link.labelEn} onChange={(event) => update("personalLinks", draft.personalLinks.map((item, itemIndex) => itemIndex === index ? { ...item, labelEn: event.target.value } : item))} /><input className={input} placeholder="https://" value={link.url} onChange={(event) => update("personalLinks", draft.personalLinks.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item))} /><button className="text-sm text-red-700 underline" onClick={() => update("personalLinks", draft.personalLinks.filter((_, itemIndex) => itemIndex !== index))} type="button">删除</button></div>)}</div></section>
      <button className="rounded-lg bg-cyan-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-cyan-800 disabled:opacity-50" disabled={busy || JSON.stringify(profile) === JSON.stringify(draft)} onClick={save}>{busy ? "保存中..." : "保存资料"}</button>
    </div> : null}
    {tab === "public" ? <PublicProfilePanel busy={busy} draft={draft} onSave={save} update={update} visible={visible} /> : null}
    {tab === "scholarly" && draft.accountKind === "person" ? <div className="mt-7"><ScholarlyProfileForm mode="self" /></div> : null}
    {tab === "security" ? <PasswordForm busy={busy} error="" onSubmit={changePassword} /> : null}
    <MediaPicker onClose={() => setMediaPickerOpen(false)} onSelect={(asset) => { update("avatarAssetId", asset.id); update("avatarUrl", asset.url); update("avatarPositionX", 50); update("avatarPositionY", 50); update("avatarZoom", 1); }} open={mediaPickerOpen}/>
  </section>;
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange(value: string): void; placeholder?: string }) { return <label className="text-sm font-medium">{label}<input className={input} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function TextArea({ label, value, onChange }: { label: string; value: string; onChange(value: string): void }) { return <label className="text-sm font-medium sm:col-span-2">{label}<textarea className={`${input} min-h-28`} value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function ReadOnly({ label, value }: { label: string; value: string }) { return <label className="text-sm font-medium">{label}<input className={`${input} bg-slate-100`} disabled value={value} /></label>; }
function Range({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange(value: number): void }) { return <label className="text-xs font-medium text-slate-700">{label}<span className="ml-2 text-slate-500">{value}</span><input className="mt-2 block w-full accent-cyan-700" max={max} min={min} onChange={(event) => onChange(Number(event.target.value))} step={step} type="range" value={value} /></label>; }
function AvatarPreview({ alt, className, profile }: { alt: string; className: string; profile: Pick<Profile, "avatarUrl" | "avatarPositionX" | "avatarPositionY" | "avatarZoom"> }) { return <div className={`aspect-square overflow-hidden bg-slate-100 ${className}`}><img alt={alt} className="h-full w-full object-cover" src={profile.avatarUrl ?? ""} style={{ objectPosition: `${profile.avatarPositionX}% ${profile.avatarPositionY}%`, transform: `scale(${profile.avatarZoom})`, transformOrigin: `${profile.avatarPositionX}% ${profile.avatarPositionY}%` }} /></div>; }
function PublicProfilePanel({ busy, draft, onSave, update, visible }: { busy: boolean; draft: Profile; onSave(): Promise<void>; update<K extends keyof Profile>(key: K, value: Profile[K]): void; visible: Set<string> }) {
  const alumni = draft.memberStatus === "alumni";
  const stage = academicStageLabels[draft.academicStage];
  const identity = alumni
    ? `${visible.has("graduation_year") && draft.graduationYear ? `${draft.graduationYear}届` : ""}${visible.has("academic_stage") ? stage : ""}`
    : visible.has("academic_stage") && visible.has("enrollment_year") && draft.enrollmentYear
      ? `${draft.enrollmentYear}级${stage}`
      : visible.has("academic_stage")
        ? stage
        : visible.has("enrollment_year") && draft.enrollmentYear
          ? `${draft.enrollmentYear}级`
          : "";
  return <div className="mt-7 grid gap-8 lg:grid-cols-[1fr_1.2fr]">
    <div>
      <p className={`p-3 text-sm ${draft.publicVisible ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{draft.publicVisible ? "管理员已将你的账号列入官网成员页。" : "当前账号未被管理员列入官网成员页；你的展示设置会被保存，启用后生效。"}</p>
      <p className="mt-3 text-xs leading-5 text-slate-500">“学术身份”只控制卡片或详情中的显式文字；成员所在分组仍由学术身份决定。</p>
      <div className="mt-5 grid gap-5 sm:grid-cols-3">{publicProfileFieldGroups.map((group) => <section key={group.label}><h3 className="mb-2 text-xs font-bold text-blue-950">{group.label}</h3><div className="space-y-2">{group.fields.map(([key, label]) => <label className="flex items-center justify-between gap-3 border-b border-slate-200 py-2 text-sm" key={key}><span>{label}</span><input checked={visible.has(key)} type="checkbox" onChange={(event) => update("publicFields", event.target.checked ? [...draft.publicFields, key] : draft.publicFields.filter((value) => value !== key))} /></label>)}</div></section>)}</div>
      <button className="mt-5 bg-blue-950 px-5 py-2.5 text-sm font-semibold text-white" disabled={busy} onClick={() => void onSave()}>{busy ? "保存中…" : "保存公开设置"}</button>
    </div>
    <article className="border border-slate-200 bg-white p-6"><p className="text-xs font-bold text-cyan-800">公开成员页预览</p>{visible.has("avatar") && draft.avatarUrl ? <AvatarPreview alt="公开照片预览" className="mt-4 w-28" profile={draft} /> : null}<h2 className="mt-3 font-serif text-2xl text-blue-950">{visible.has("name_zh") ? draft.nameZh : ""} <span className="text-base text-slate-500">{visible.has("name_en") ? draft.nameEn : ""}</span></h2>{identity ? <p className="mt-2 text-sm text-slate-600">{identity}</p> : null}{visible.has("major") ? <p className="mt-2 text-sm">{draft.majorZh || draft.majorEn}</p> : null}{visible.has("research") ? <p className="mt-5 text-sm"><b>研究方向：</b>{draft.researchInterestsZh || draft.researchInterestsEn}</p> : null}{visible.has("bio") ? <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-slate-700">{draft.bioZh || draft.bioEn}</p> : null}{visible.has("thesis") && alumni && (draft.thesisZh || draft.thesisEn) ? <p className="mt-4 text-sm"><b>学位论文：</b>{draft.thesisZh || draft.thesisEn}</p> : null}{visible.has("destination") && alumni && (draft.destinationZh || draft.destinationEn) ? <p className="mt-4 text-sm"><b>毕业去向：</b>{draft.destinationZh || draft.destinationEn}</p> : null}{visible.has("email") && draft.publicEmail ? <p className="mt-4 text-sm">邮箱：{draft.publicEmail}</p> : null}{visible.has("phone") && draft.phone ? <p className="mt-2 text-sm">电话：{draft.phone}</p> : null}{visible.has("links") && draft.personalLinks.length ? <div className="mt-5 flex flex-wrap gap-3">{draft.personalLinks.map((link, index) => <span className="text-sm text-cyan-800 underline" key={index}>{link.labelZh || link.labelEn}</span>)}</div> : null}</article>
  </div>;
}
function PasswordForm({ busy, error, onSubmit, requiredChange = false }: { busy: boolean; error: string; onSubmit(event: React.FormEvent<HTMLFormElement>): void; requiredChange?: boolean }) { return <section className="max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-xs font-semibold text-cyan-800">账号安全</p><h1 className="mt-1 text-2xl font-bold text-slate-950">{requiredChange ? "首次登录修改密码" : "修改密码"}</h1>{requiredChange ? <p className="mt-3 text-sm text-slate-600">当前账号使用临时密码，修改后即可进入控制台。</p> : null}{error ? <p className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}<form className="mt-7 space-y-5" onSubmit={onSubmit}><label className="block text-sm font-medium">当前密码<input autoComplete="current-password" className={input} name="currentPassword" required type="password" /></label><label className="block text-sm font-medium">新密码<input autoComplete="new-password" className={input} minLength={8} name="newPassword" required type="password" /><span className="mt-2 block text-xs text-slate-500">至少 8 个字符。</span></label><label className="block text-sm font-medium">确认新密码<input autoComplete="new-password" className={input} minLength={8} name="confirmPassword" required type="password" /></label><button className="rounded-lg bg-cyan-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-cyan-800 disabled:opacity-50" disabled={busy} type="submit">{busy ? "修改中..." : requiredChange ? "修改密码并继续" : "修改密码"}</button></form></section>; }
