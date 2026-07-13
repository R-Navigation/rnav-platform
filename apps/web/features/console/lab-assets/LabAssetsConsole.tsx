"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { LabAssetsRequestError, mutateLabAssets, readLabAssetsError } from "./api";
import { getTrappedFocusIndex } from "./dialog-keyboard";
import {
  canWriteLabAssets,
  filterAssets,
  normalizeLabAssetsSnapshot,
  type LabAsset,
  type LabAssetsSnapshot,
  type LabPlatform,
  type LabPlatformType,
  type LocalizedText,
} from "./model";

type Props = { permissions: string[] };
type View = "overview" | "platforms" | "assets" | "page";
type Editor =
  | { kind: "asset"; originalCode?: string; value: LabAsset }
  | { kind: "platform"; originalCode?: string; value: LabPlatform }
  | { kind: "type"; originalCode?: string; value: LabPlatformType }
  | null;

const field = "w-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-cyan-600";
const primary = "bg-blue-950 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-400";
const secondary = "border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-cyan-700";
const danger = "border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50";
const assetStatuses = ["idle", "mounted", "maintenance", "retired", "lend"] as const;
const platformStatuses = ["active", "partial", "empty", "maintenance", "lend"] as const;

const assetStatusLabels: Record<string, string> = { idle: "闲置", mounted: "已装载", maintenance: "维护中", retired: "已报废", lend: "借出" };
const platformStatusLabels: Record<string, string> = { active: "运行中", partial: "部分可用", empty: "空平台", maintenance: "维护中", lend: "借出" };

function emptyText(): LocalizedText { return { zh: "", en: "" }; }
function emptyAsset(sortOrder: number): LabAsset {
  return { code: "", currentPlatformCode: null, description: emptyText(), deviceType: emptyText(), model: "", name: emptyText(), notes: [], shareScope: "private", sortOrder, status: "idle", vendorSerial: "" };
}
function emptyPlatform(sortOrder: number): LabPlatform {
  return { assets: [], code: "", description: emptyText(), name: emptyText(), notes: [], sortOrder, status: "active", typeCode: null };
}
function emptyType(sortOrder: number): LabPlatformType {
  return { code: "", description: emptyText(), name: emptyText(), platforms: [], sortOrder };
}

function LocalizedFields({ label, onChange, textarea = false, value }: { label: string; onChange: (value: LocalizedText) => void; textarea?: boolean; value: LocalizedText }) {
  const Element = textarea ? "textarea" : "input";
  return <div className="grid gap-3 sm:grid-cols-2">
    <label className="text-sm font-semibold text-slate-700">{label}（中文）<Element className={`${field} mt-1 ${textarea ? "min-h-24" : ""}`} onChange={(event) => onChange({ ...value, zh: event.target.value })} value={value.zh} /></label>
    <label className="text-sm font-semibold text-slate-700">{label}（English）<Element className={`${field} mt-1 ${textarea ? "min-h-24" : ""}`} onChange={(event) => onChange({ ...value, en: event.target.value })} value={value.en} /></label>
  </div>;
}

function StatusBadge({ labels, status }: { labels: Record<string, string>; status: string }) {
  return <span className="inline-flex border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">{labels[status] ?? status}</span>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="border-l-2 border-cyan-600 bg-white px-4 py-3"><strong className="block font-mono text-2xl text-slate-950">{value}</strong><span className="mt-1 block text-xs font-semibold text-slate-500">{label}</span></div>;
}

function assetBody(item: LabAsset, revision: string) {
  return { code: item.code, currentPlatformCode: item.currentPlatformCode, description: item.description, deviceType: item.deviceType,
    model: item.model, name: item.name, shareScope: item.shareScope, sortOrder: item.sortOrder, status: item.status,
    vendorSerial: item.vendorSerial, expectedRevision: revision };
}
function platformBody(item: LabPlatform, revision: string) {
  return { code: item.code, description: item.description, name: item.name, sortOrder: item.sortOrder, status: item.status,
    typeCode: item.typeCode, expectedRevision: revision };
}
function typeBody(item: LabPlatformType, revision: string) {
  return { code: item.code, description: item.description, name: item.name, sortOrder: item.sortOrder, expectedRevision: revision };
}

export function LabAssetsConsole({ permissions }: Props) {
  const writable = canWriteLabAssets(permissions);
  const [snapshot, setSnapshot] = useState<LabAssetsSnapshot | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [view, setView] = useState<View>("overview");
  const [editor, setEditor] = useState<Editor>(null);
  const [selectedAssetCode, setSelectedAssetCode] = useState("");
  const [filters, setFilters] = useState({ platform: "all", query: "", status: "all" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [pageJson, setPageJson] = useState("{}");
  const [revisionConflict, setRevisionConflict] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const firstEditorInputRef = useRef<HTMLInputElement>(null);
  const editorTriggerRef = useRef<HTMLElement | null>(null);
  const editorOpen = editor !== null;

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoadState("loading");
    try {
      const response = await fetch("/api/lab-assets", { cache: "no-store" });
      if (!response.ok) throw new Error(await readLabAssetsError(response));
      const next = normalizeLabAssetsSnapshot(await response.json());
      setSnapshot(next);
      setPageJson(JSON.stringify(next.page, null, 2));
      setLoadState("ready");
      return next;
    } catch (error) {
      setLoadState("error");
      setMessage(error instanceof Error ? error.message : "无法加载实验室资产。");
      return null;
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!editorOpen) return;
    const dialog = dialogRef.current;
    dialog?.showModal();
    firstEditorInputRef.current?.focus();
    return () => {
      if (dialog?.open) dialog.close();
      editorTriggerRef.current?.focus();
    };
  }, [editorOpen]);

  const filteredAssets = useMemo(() => snapshot ? filterAssets(snapshot.assets, filters) : [], [filters, snapshot]);
  const selectedAsset = snapshot?.assets.find((item) => item.code === selectedAssetCode) ?? filteredAssets[0];

  function updateEditorCommon(value: Partial<Pick<LabAsset, "code" | "description" | "name" | "sortOrder">>) {
    setEditor((current) => current ? ({ ...current, value: { ...current.value, ...value } } as Editor) : current);
  }

  function openEditor(next: Exclude<Editor, null>) {
    editorTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditor(next);
  }

  function closeEditor() {
    setEditor(null);
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeEditor();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])") ?? []);
    const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
    const nextIndex = getTrappedFocusIndex(currentIndex, focusable.length, event.shiftKey);
    if (nextIndex === null) return;
    event.preventDefault();
    focusable[nextIndex]?.focus();
  }

  async function mutate(endpoint: string, method: "POST" | "PUT" | "DELETE", body: Record<string, unknown>, success: string) {
    if (!snapshot) return;
    setBusy(true);
    setMessage("");
    setRevisionConflict(false);
    try {
      await mutateLabAssets(endpoint, method, body);
      const next = await load(true);
      if (next) {
        setMessage(success);
        closeEditor();
        setNoteDrafts({});
      }
    } catch (error) {
      setRevisionConflict(error instanceof LabAssetsRequestError && error.status === 409);
      setMessage(error instanceof Error ? error.message : "操作失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function saveEditor() {
    if (!snapshot || !editor) return;
    if (editor.kind === "asset") {
      const endpoint = editor.originalCode ? `/assets/${encodeURIComponent(editor.originalCode)}` : "/assets";
      await mutate(endpoint, editor.originalCode ? "PUT" : "POST", assetBody(editor.value, snapshot.revision), "设备信息已保存。");
    } else if (editor.kind === "platform") {
      const endpoint = editor.originalCode ? `/platforms/${encodeURIComponent(editor.originalCode)}` : "/platforms";
      await mutate(endpoint, editor.originalCode ? "PUT" : "POST", platformBody(editor.value, snapshot.revision), "平台信息已保存。");
    } else {
      const endpoint = editor.originalCode ? `/platform-types/${encodeURIComponent(editor.originalCode)}` : "/platform-types";
      await mutate(endpoint, editor.originalCode ? "PUT" : "POST", typeBody(editor.value, snapshot.revision), "平台类型已保存。");
    }
  }

  async function remove(kind: "asset" | "platform" | "type", code: string) {
    if (!snapshot || !window.confirm(`确定删除 ${code}？此操作不可撤销。`)) return;
    const path = kind === "asset" ? "assets" : kind === "platform" ? "platforms" : "platform-types";
    await mutate(`/${path}/${encodeURIComponent(code)}`, "DELETE", { expectedRevision: snapshot.revision }, `${code} 已删除。`);
  }

  async function addNote(kind: "asset" | "platform", code: string) {
    const key = `${kind}:${code}`;
    const noteText = noteDrafts[key]?.trim() ?? "";
    if (!snapshot || !noteText) return;
    const path = kind === "asset" ? "assets" : "platforms";
    await mutate(`/${path}/${encodeURIComponent(code)}/notes`, "POST", { content: { zh: noteText, en: noteText }, sortOrder: 0, expectedRevision: snapshot.revision }, "备注已添加。");
  }

  async function removeNote(kind: "asset" | "platform", code: string, noteId: string) {
    if (!snapshot || !window.confirm("确定删除这条备注？")) return;
    const path = kind === "asset" ? "assets" : "platforms";
    await mutate(`/${path}/${encodeURIComponent(code)}/notes/${encodeURIComponent(noteId)}`, "DELETE", { expectedRevision: snapshot.revision }, "备注已删除。");
  }

  if (loadState === "loading") return <section aria-busy="true"><p className="text-sm font-semibold text-cyan-700">实验室资产</p><h1 className="mt-2 font-serif text-3xl font-bold">正在加载资产台账...</h1></section>;
  if (loadState === "error" || !snapshot) return <section><p className="text-sm font-semibold text-cyan-700">实验室资产</p><h1 className="mt-2 font-serif text-3xl font-bold">无法加载资产台账</h1><p className="mt-4 text-red-700" role="alert">{message}</p><button className={`${primary} mt-6`} onClick={() => void load()} type="button">重试</button></section>;

  return <section aria-labelledby="lab-assets-heading">
    <header className="flex flex-wrap items-end justify-between gap-5 border-b border-slate-300 pb-5">
      <div><p className="text-sm font-semibold text-cyan-700">内部资源</p><h1 className="mt-2 font-serif text-3xl font-bold text-slate-950" id="lab-assets-heading">实验室资产</h1><p className="mt-2 text-sm text-slate-600">设备、平台与当前挂载关系的统一台账</p></div>
      <div className="text-right">{writable ? <span className="inline-flex border border-cyan-600 bg-white px-3 py-1 text-xs font-bold text-cyan-900">可管理</span> : <span className="inline-flex border border-slate-300 bg-white px-3 py-1 text-xs font-bold text-slate-700">只读</span>}<p className="mt-2 text-xs text-slate-500">修订版本 {snapshot.revision}</p></div>
    </header>

    <nav aria-label="资产模块视图" className="mt-5 flex gap-1 overflow-x-auto border-b border-slate-300">
      {(["overview", "platforms", "assets", ...(writable ? ["page"] : [])] as View[]).map((item) => <button aria-current={view === item ? "page" : undefined} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold ${view === item ? "border-cyan-700 text-cyan-800" : "border-transparent text-slate-600"}`} key={item} onClick={() => { setView(item); closeEditor(); }} type="button">{{ overview: "台账总览", platforms: "平台", assets: "设备", page: "页面配置" }[item]}</button>)}
    </nav>

    {message ? <div className="mt-5 border border-cyan-200 bg-white px-4 py-3 text-sm text-slate-700" role={revisionConflict ? "alert" : "status"}>{message}{revisionConflict ? <button className="ml-4 font-bold text-cyan-800 underline" onClick={() => { setRevisionConflict(false); void load(true); }} type="button">刷新数据</button> : null}</div> : null}

    {view === "overview" ? <div className="mt-6 space-y-7">
      <div className="grid gap-px border border-slate-200 bg-slate-200 sm:grid-cols-3 xl:grid-cols-6">
        <Metric label="平台总数" value={snapshot.stats.totalPlatforms ?? snapshot.platforms.length} /><Metric label="运行中平台" value={snapshot.stats.activePlatforms ?? 0} /><Metric label="设备总数" value={snapshot.stats.totalAssets ?? snapshot.assets.length} /><Metric label="已装载设备" value={snapshot.stats.mountedAssets ?? 0} /><Metric label="闲置设备" value={snapshot.stats.idleAssets ?? 0} /><Metric label="维护中设备" value={snapshot.stats.maintenanceAssets ?? 0} />
      </div>
      <div><div className="flex items-end justify-between gap-4"><div><h2 className="text-xl font-bold text-slate-950">平台组成</h2><p className="mt-1 text-sm text-slate-600">按平台类型查看当前设备挂载关系</p></div></div>
        <div className="mt-4 grid gap-px border border-slate-200 bg-slate-200 lg:grid-cols-2">{snapshot.platformTypes.flatMap((type) => type.platforms.map((platform) => <article className="bg-white p-5" key={platform.code}><div className="flex items-start justify-between gap-4"><div><p className="font-mono text-xs font-bold text-cyan-700">{type.code} / {platform.code}</p><h3 className="mt-2 text-lg font-bold text-slate-950">{platform.name.zh || platform.name.en || platform.code}</h3></div><StatusBadge labels={platformStatusLabels} status={platform.status} /></div><p className="mt-3 text-sm text-slate-600">{platform.description.zh || platform.description.en || "暂无说明"}</p><div className="mt-4 flex flex-wrap gap-2">{platform.assets.length ? platform.assets.map((code) => <button className="border border-slate-300 px-2 py-1 font-mono text-xs text-slate-700 hover:border-cyan-700" key={code} onClick={() => { setFilters({ platform: "all", query: code, status: "all" }); setView("assets"); setSelectedAssetCode(code); }} type="button">{code}</button>) : <span className="text-xs text-slate-400">暂无挂载设备</span>}</div></article>))}</div>
      </div>
    </div> : null}

    {view === "assets" ? <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0"><div className="grid gap-3 border border-slate-200 bg-white p-4 md:grid-cols-[minmax(12rem,1fr)_180px_180px_auto]"><label className="text-xs font-semibold text-slate-600">搜索<input className={`${field} mt-1`} onChange={(e) => setFilters({ ...filters, query: e.target.value })} placeholder="编号、名称、型号、序列号" value={filters.query} /></label><label className="text-xs font-semibold text-slate-600">状态<select className={`${field} mt-1`} onChange={(e) => setFilters({ ...filters, status: e.target.value })} value={filters.status}><option value="all">全部状态</option>{assetStatuses.map((status) => <option key={status} value={status}>{assetStatusLabels[status]}</option>)}</select></label><label className="text-xs font-semibold text-slate-600">平台<select className={`${field} mt-1`} onChange={(e) => setFilters({ ...filters, platform: e.target.value })} value={filters.platform}><option value="all">全部平台</option><option value="unassigned">未挂载</option>{snapshot.platforms.map((item) => <option key={item.code} value={item.code}>{item.code}</option>)}</select></label>{writable ? <button className={`${primary} self-end`} onClick={() => openEditor({ kind: "asset", value: emptyAsset(snapshot.assets.length) })} type="button">新增设备</button> : <span />}</div>
        <div className="mt-4 overflow-x-auto border border-slate-200 bg-white"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-700"><tr><th className="px-4 py-3">设备</th><th className="px-4 py-3">类型 / 型号</th><th className="px-4 py-3">状态</th><th className="px-4 py-3">当前平台</th><th className="px-4 py-3">共享范围</th></tr></thead><tbody>{filteredAssets.map((item) => <tr className={`border-b border-slate-100 hover:bg-slate-50 ${selectedAsset?.code === item.code ? "shadow-[inset_3px_0_0_#0891b2]" : ""}`} key={item.code}><td className="px-4 py-3"><button className="w-full text-left" onClick={() => setSelectedAssetCode(item.code)} type="button"><strong className="font-mono text-slate-950">{item.code}</strong><span className="mt-1 block text-xs text-slate-500">{item.name.zh || item.name.en}</span></button></td><td className="px-4 py-3">{item.deviceType.zh || item.deviceType.en}<span className="ml-2 text-slate-400">{item.model}</span></td><td className="px-4 py-3"><StatusBadge labels={assetStatusLabels} status={item.status} /></td><td className="px-4 py-3 font-mono text-xs">{item.currentPlatformCode ?? "未挂载"}</td><td className="px-4 py-3">{item.shareScope}</td></tr>)}</tbody></table>{filteredAssets.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">没有符合筛选条件的设备。</p> : null}</div></div>
      <aside className="border-t-4 border-cyan-700 bg-white p-5 shadow-sm">{selectedAsset ? <><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold text-cyan-700">{selectedAsset.code}</p><h2 className="mt-2 text-xl font-bold">{selectedAsset.name.zh || selectedAsset.name.en || selectedAsset.code}</h2></div><StatusBadge labels={assetStatusLabels} status={selectedAsset.status} /></div><dl className="mt-5 grid grid-cols-[100px_1fr] gap-x-3 gap-y-3 text-sm"><dt className="text-slate-500">设备类型</dt><dd>{selectedAsset.deviceType.zh || selectedAsset.deviceType.en}</dd><dt className="text-slate-500">型号</dt><dd>{selectedAsset.model || "-"}</dd><dt className="text-slate-500">厂商序列号</dt><dd className="break-all font-mono text-xs">{selectedAsset.vendorSerial || "-"}</dd><dt className="text-slate-500">当前平台</dt><dd>{selectedAsset.currentPlatformCode || "未挂载"}</dd><dt className="text-slate-500">说明</dt><dd>{selectedAsset.description.zh || selectedAsset.description.en || "-"}</dd></dl><div className="mt-5 border-t border-slate-200 pt-4"><h3 className="text-sm font-bold">备注</h3>{selectedAsset.notes.map((note) => <div className="mt-2 flex items-start justify-between gap-3 border-l-2 border-slate-300 pl-3 text-sm" key={note.id}><span>{note.content.zh || note.content.en || "空备注"}</span>{writable ? <button className="text-xs font-semibold text-red-700" onClick={() => void removeNote("asset", selectedAsset.code, note.id)} type="button">删除</button> : null}</div>)}{writable ? <div className="mt-3 flex gap-2"><input className={field} onChange={(e) => setNoteDrafts((current) => ({ ...current, [`asset:${selectedAsset.code}`]: e.target.value }))} placeholder="新增备注" value={noteDrafts[`asset:${selectedAsset.code}`] ?? ""} /><button className={secondary} disabled={busy} onClick={() => void addNote("asset", selectedAsset.code)} type="button">添加</button></div> : null}</div>{writable ? <div className="mt-6 flex gap-2"><button className={primary} onClick={() => openEditor({ kind: "asset", originalCode: selectedAsset.code, value: structuredClone(selectedAsset) })} type="button">编辑</button><button className={danger} onClick={() => void remove("asset", selectedAsset.code)} type="button">删除</button></div> : null}</> : <p className="text-sm text-slate-500">请选择设备查看详情。</p>}</aside>
    </div> : null}

    {view === "platforms" ? <div className="mt-6 space-y-7"><div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-xl font-bold">平台与类型</h2><p className="mt-1 text-sm text-slate-600">平台组成由设备的当前平台字段自动计算</p></div>{writable ? <div className="flex gap-2"><button className={secondary} onClick={() => openEditor({ kind: "type", value: emptyType(snapshot.platformTypes.length) })} type="button">新增类型</button><button className={primary} onClick={() => openEditor({ kind: "platform", value: emptyPlatform(snapshot.platforms.length) })} type="button">新增平台</button></div> : null}</div>{snapshot.platformTypes.map((type) => <section key={type.code}><div className="flex items-center justify-between border-b border-slate-300 pb-2"><div><h3 className="font-mono text-sm font-bold text-cyan-800">{type.code} · {type.name.zh || type.name.en}</h3><p className="mt-1 text-xs text-slate-500">{type.platforms.length} 个平台</p></div>{writable && type.code !== "uncategorized" ? <div className="flex gap-2"><button className={secondary} onClick={() => openEditor({ kind: "type", originalCode: type.code, value: structuredClone(type) })} type="button">编辑类型</button><button className={danger} onClick={() => void remove("type", type.code)} type="button">删除</button></div> : null}</div><div className="grid gap-px border-x border-b border-slate-200 bg-slate-200 md:grid-cols-2 xl:grid-cols-3">{type.platforms.map((item) => <article className="bg-white p-5" key={item.code}><div className="flex justify-between gap-3"><div><strong className="font-mono text-slate-950">{item.code}</strong><p className="mt-1 text-sm font-semibold">{item.name.zh || item.name.en}</p></div><StatusBadge labels={platformStatusLabels} status={item.status} /></div><p className="mt-3 min-h-10 text-sm text-slate-600">{item.description.zh || item.description.en || "暂无说明"}</p><p className="mt-4 text-xs font-semibold text-slate-500">挂载设备 {item.assets.length} 台</p><div className="mt-2 flex flex-wrap gap-1">{item.assets.map((code) => <span className="border border-slate-300 px-2 py-1 font-mono text-xs" key={code}>{code}</span>)}</div>{item.notes.map((note) => <div className="mt-3 flex justify-between gap-2 border-l-2 border-slate-300 pl-3 text-xs" key={note.id}><span>{note.content.zh || note.content.en || "空备注"}</span>{writable ? <button className="text-red-700" onClick={() => void removeNote("platform", item.code, note.id)} type="button">删除</button> : null}</div>)}{writable ? <><div className="mt-4 flex gap-2"><input className={field} onChange={(e) => setNoteDrafts((current) => ({ ...current, [`platform:${item.code}`]: e.target.value }))} placeholder="平台备注" value={noteDrafts[`platform:${item.code}`] ?? ""} /><button className={secondary} onClick={() => void addNote("platform", item.code)} type="button">添加</button></div><div className="mt-4 flex gap-2"><button className={primary} onClick={() => openEditor({ kind: "platform", originalCode: item.code, value: structuredClone(item) })} type="button">编辑</button><button className={danger} onClick={() => void remove("platform", item.code)} type="button">删除</button></div></> : null}</article>)}</div></section>)}</div> : null}

    {view === "page" && writable ? <div className="mt-6 max-w-4xl"><h2 className="text-xl font-bold">页面文案配置</h2><p className="mt-2 text-sm text-slate-600">高级配置用于维护资产页面的双语标题、区块和空状态文案。</p><textarea className="mt-5 min-h-[32rem] w-full border border-slate-300 bg-slate-950 p-4 font-mono text-sm leading-6 text-slate-100" onChange={(e) => setPageJson(e.target.value)} spellCheck={false} value={pageJson} /><button className={`${primary} mt-4`} disabled={busy} onClick={() => { try { const page = JSON.parse(pageJson) as unknown; void mutate("/page", "PUT", { page, expectedRevision: snapshot.revision }, "页面配置已保存。"); } catch { setMessage("JSON 格式无效，请修正后再保存。"); } }} type="button">保存页面配置</button></div> : null}

    {editor ? <dialog aria-labelledby="asset-editor-title" className="m-auto w-[calc(100%-2rem)] max-w-3xl border-0 bg-transparent p-0 backdrop:bg-slate-950/50" onCancel={(event) => { event.preventDefault(); closeEditor(); }} onKeyDown={handleDialogKeyDown} ref={dialogRef}><form className="max-h-[90vh] overflow-y-auto border-t-4 border-cyan-600 bg-white p-6 shadow-2xl" onSubmit={(event) => { event.preventDefault(); void saveEditor(); }}><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-cyan-700">资产管理</p><h2 className="mt-1 text-2xl font-bold" id="asset-editor-title">{editor.originalCode ? "编辑" : "新增"}{editor.kind === "asset" ? "设备" : editor.kind === "platform" ? "平台" : "平台类型"}</h2></div><button aria-label="关闭编辑器" className="text-2xl text-slate-500" onClick={closeEditor} type="button">×</button></div><div className="mt-6 grid gap-4"><label className="text-sm font-semibold text-slate-700">唯一编号<input className={`${field} mt-1`} onChange={(e) => updateEditorCommon({ code: e.target.value })} ref={firstEditorInputRef} required value={editor.value.code} /></label><LocalizedFields label="名称" onChange={(name) => updateEditorCommon({ name })} value={editor.value.name} /><LocalizedFields label="说明" onChange={(description) => updateEditorCommon({ description })} textarea value={editor.value.description} /><label className="text-sm font-semibold text-slate-700">排序<input className={`${field} mt-1`} onChange={(e) => updateEditorCommon({ sortOrder: Number(e.target.value) })} type="number" value={editor.value.sortOrder} /></label>{editor.kind === "asset" ? <><LocalizedFields label="设备类型" onChange={(deviceType) => setEditor({ ...editor, value: { ...editor.value, deviceType } })} value={editor.value.deviceType} /><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold text-slate-700">型号<input className={`${field} mt-1`} onChange={(e) => setEditor({ ...editor, value: { ...editor.value, model: e.target.value } })} value={editor.value.model} /></label><label className="text-sm font-semibold text-slate-700">厂商序列号<input className={`${field} mt-1`} onChange={(e) => setEditor({ ...editor, value: { ...editor.value, vendorSerial: e.target.value } })} value={editor.value.vendorSerial} /></label><label className="text-sm font-semibold text-slate-700">状态<select className={`${field} mt-1`} onChange={(e) => setEditor({ ...editor, value: { ...editor.value, status: e.target.value as LabAsset["status"] } })} value={editor.value.status}>{assetStatuses.map((status) => <option key={status} value={status}>{assetStatusLabels[status]}</option>)}</select></label><label className="text-sm font-semibold text-slate-700">当前平台<select className={`${field} mt-1`} onChange={(e) => setEditor({ ...editor, value: { ...editor.value, currentPlatformCode: e.target.value || null } })} value={editor.value.currentPlatformCode ?? ""}><option value="">未挂载</option>{snapshot.platforms.map((item) => <option key={item.code} value={item.code}>{item.code}</option>)}</select></label><label className="text-sm font-semibold text-slate-700">共享范围<input className={`${field} mt-1`} onChange={(e) => setEditor({ ...editor, value: { ...editor.value, shareScope: e.target.value } })} required value={editor.value.shareScope} /></label></div></> : null}{editor.kind === "platform" ? <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold text-slate-700">平台类型<select className={`${field} mt-1`} onChange={(e) => setEditor({ ...editor, value: { ...editor.value, typeCode: e.target.value || null } })} value={editor.value.typeCode ?? ""}><option value="">未分类</option>{snapshot.platformTypes.filter((item) => item.code !== "uncategorized").map((item) => <option key={item.code} value={item.code}>{item.code}</option>)}</select></label><label className="text-sm font-semibold text-slate-700">状态<select className={`${field} mt-1`} onChange={(e) => setEditor({ ...editor, value: { ...editor.value, status: e.target.value as LabPlatform["status"] } })} value={editor.value.status}>{platformStatuses.map((status) => <option key={status} value={status}>{platformStatusLabels[status]}</option>)}</select></label></div> : null}</div><div className="mt-7 flex justify-end gap-3"><button className={secondary} onClick={closeEditor} type="button">取消</button><button className={primary} disabled={busy} type="submit">{busy ? "保存中..." : "保存"}</button></div></form></dialog> : null}
  </section>;
}
