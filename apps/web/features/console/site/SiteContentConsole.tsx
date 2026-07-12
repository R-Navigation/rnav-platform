"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DiscardDialog } from "./DiscardDialog";
import { PageEditor } from "./PageEditor";
import { TeamEditor } from "./TeamEditor";
import { readSiteAdminError } from "./api";
import {
  applyConflictSnapshot,
  applySavedModule,
  createSaveRequest,
  getAvailableSiteModules,
  getEditorInteractionState,
  isModuleDirty,
  isJsonEditorDirty,
  normalizeSiteAdminSnapshot,
  parseJsonEditorValue,
  retainConflictAfterRefreshFailure,
  type SiteModuleConflict,
  type SiteModule,
} from "./model";

type Props = { permissions?: string[] };
type LoadState = "loading" | "ready" | "error";
type SaveState = "idle" | "saving" | "saved";
type EditorMode = "form" | "json";

export function SiteContentConsole({ permissions }: Props) {
  const [modules, setModules] = useState<SiteModule[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [draftValue, setDraftValue] = useState<unknown>({});
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState<SiteModuleConflict | null>(null);
  const [conflictRefreshing, setConflictRefreshing] = useState(false);
  const [mode, setMode] = useState<EditorMode>("form");
  const [jsonSource, setJsonSource] = useState("");
  const [jsonError, setJsonError] = useState("");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const moduleButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingTriggerRef = useRef<HTMLButtonElement | null>(null);

  const availableModules = useMemo(() => getAvailableSiteModules(modules, permissions), [modules, permissions]);
  const selectedModule = availableModules.find((module) => module.key === selectedKey) ?? availableModules[0];
  const dirty = selectedModule
    ? isModuleDirty(selectedModule, draftValue) || isJsonEditorDirty(selectedModule.value, jsonSource)
    : false;
  const editorInteraction = getEditorInteractionState(conflictRefreshing);

  const selectModule = useCallback((module: SiteModule) => {
    setSelectedKey(module.key);
    setDraftValue(module.value);
    setJsonSource(JSON.stringify(module.value, null, 2));
    setJsonError("");
    setMessage("");
    setConflict(null);
    setSaveState("idle");
    setMode("form");
  }, []);

  const loadSnapshot = useCallback(async (preferredKey?: string) => {
    setLoadState("loading");
    setMessage("");
    try {
      const response = await fetch("/api/site-admin/snapshot", { cache: "no-store" });
      if (!response.ok) throw new Error(await readSiteAdminError(response));
      const normalized = normalizeSiteAdminSnapshot(await response.json());
      const available = getAvailableSiteModules(normalized, permissions);
      setModules(normalized);
      const next = available.find((module) => module.key === preferredKey) ?? available[0];
      if (next) selectModule(next);
      setLoadState("ready");
    } catch (error) {
      setLoadState("error");
      setMessage(error instanceof Error ? error.message : "无法加载官网内容。请稍后重试。");
    }
  }, [permissions, selectModule]);

  useEffect(() => { void loadSnapshot(); }, [loadSnapshot]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function requestModuleSwitch(key: string) {
    const next = availableModules.find((module) => module.key === key);
    if (!next || next.key === selectedModule?.key) return;
    if (dirty) {
      pendingTriggerRef.current = moduleButtonRefs.current.get(key) ?? null;
      setPendingKey(key);
    }
    else selectModule(next);
  }

  function discardAndSwitch() {
    const next = availableModules.find((module) => module.key === pendingKey);
    setPendingKey(null);
    if (next) selectModule(next);
  }

  function updateDraft(value: unknown) {
    setDraftValue(value);
    setJsonSource(JSON.stringify(value, null, 2));
    setJsonError("");
    setMessage("");
    setConflict(null);
    setSaveState("idle");
  }

  function updateJson(source: string) {
    setJsonSource(source);
    const result = parseJsonEditorValue(source);
    if (!result.ok) {
      setJsonError(result.error);
      return;
    }
    setJsonError("");
    setDraftValue(result.value);
    setMessage("");
    setConflict(null);
    setSaveState("idle");
  }

  async function saveCurrentModule() {
    if (!selectedModule || jsonError || !dirty) return;
    setSaveState("saving");
    setMessage("");
    setConflict(null);
    const request = createSaveRequest({ ...selectedModule, value: draftValue });
    try {
      const response = await fetch(`/api/site-admin${request.endpoint}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request.body),
      });
      if (response.status === 409) {
        setConflict({
          moduleKey: selectedModule.key,
          draftValue,
          baselineValue: selectedModule.value,
          previousRevision: selectedModule.revision,
        });
        setMessage(await readSiteAdminError(response));
        setSaveState("idle");
        return;
      }
      if (!response.ok) throw new Error(await readSiteAdminError(response));
      const payload = await response.json() as { updatedAt?: unknown };
      if (typeof payload.updatedAt !== "string") {
        await loadSnapshot(selectedModule.key);
        return;
      }
      const saved = applySavedModule({ ...selectedModule, value: draftValue }, payload.updatedAt);
      setModules((current) => current.map((module) => module.key === saved.key ? saved : module));
      setJsonSource(JSON.stringify(draftValue, null, 2));
      setSaveState("saved");
      setMessage("已保存当前模块。");
    } catch (error) {
      setSaveState("idle");
      setMessage(error instanceof Error ? error.message : "保存失败，请稍后重试。");
    }
  }

  async function resolveConflict(choice: "reload" | "keep-local") {
    if (!conflict) return;
    setConflictRefreshing(true);
    try {
      const response = await fetch("/api/site-admin/snapshot", { cache: "no-store" });
      if (!response.ok) throw new Error(await readSiteAdminError(response));
      const latest = normalizeSiteAdminSnapshot(await response.json());
      const resolved = applyConflictSnapshot(latest, conflict, choice);
      setModules(resolved.modules);
      setSelectedKey(resolved.module.key);
      setDraftValue(resolved.draftValue);
      setJsonSource(JSON.stringify(resolved.draftValue, null, 2));
      setJsonError("");
      setConflict(null);
      setSaveState("idle");
      const revision = resolved.module.revision ?? "未提供";
      if (choice === "reload") {
        setMessage(`已重新加载最新版本 ${revision}，本地草稿已替换。`);
      } else {
        const compareHint = resolved.serverValueChanged ? "服务器内容也有变化；" : "";
        setMessage(`本地草稿已基于最新版本 ${revision} 重新建立基线；${compareHint}请核对后再次保存。`);
      }
    } catch (error) {
      const retained = retainConflictAfterRefreshFailure(
        conflict,
        error instanceof Error ? `刷新最新版本失败：${error.message}` : "刷新最新版本失败，请稍后重试。",
      );
      setConflict(retained.conflict);
      setMessage(retained.error);
    } finally {
      setConflictRefreshing(false);
    }
  }

  if (loadState === "loading") {
    return <section aria-busy="true" aria-live="polite"><p className="text-sm font-semibold text-cyan-700">官网内容</p><h1 className="mt-2 font-serif text-3xl font-bold text-slate-950">正在加载内容...</h1></section>;
  }
  if (loadState === "error") {
    return <section aria-labelledby="site-load-error"><p className="text-sm font-semibold text-cyan-700">官网内容</p><h1 className="mt-2 font-serif text-3xl font-bold text-slate-950" id="site-load-error">无法加载官网内容</h1><p className="mt-4 text-slate-700" role="alert">{message}</p><button className="mt-6 bg-blue-950 px-4 py-2 text-sm font-bold text-white" onClick={() => void loadSnapshot(selectedKey)} type="button">重试</button></section>;
  }
  if (!selectedModule) {
    return <section><p className="text-sm font-semibold text-cyan-700">官网内容</p><h1 className="mt-2 font-serif text-3xl font-bold text-slate-950">没有可编辑模块</h1><p className="mt-4 text-slate-700">当前控制台权限未开放任何官网内容模块。</p></section>;
  }

  return (
    <section aria-labelledby="site-console-heading">
      <div className="flex flex-wrap items-end justify-between gap-5 border-b border-slate-300 pb-5">
        <div>
          <p className="text-sm font-semibold text-cyan-700">控制台模块</p>
          <h1 className="mt-2 font-serif text-3xl font-bold text-slate-950" id="site-console-heading">官网内容</h1>
        </div>
        <div className="flex items-center gap-3">
          <span aria-live="polite" className="text-sm font-semibold text-slate-600">{saveState === "saving" ? "保存中..." : saveState === "saved" ? "已保存" : dirty ? "有未保存更改" : "无未保存更改"}</span>
          <button className="bg-blue-950 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-400" disabled={!dirty || saveState === "saving" || conflictRefreshing || Boolean(jsonError)} onClick={() => void saveCurrentModule()} type="button">保存当前模块</button>
        </div>
      </div>

      <fieldset aria-busy={editorInteraction.busy} className="min-w-0" disabled={editorInteraction.disabled}>
      <nav aria-label="官网内容模块" className="mt-5 overflow-x-auto border-b border-slate-300">
        <div className="flex min-w-max gap-1" role="tablist">
          {availableModules.map((module) => (
            <button aria-selected={module.key === selectedModule.key} className={`border-b-2 px-3 py-2.5 text-sm font-semibold ${module.key === selectedModule.key ? "border-cyan-700 text-cyan-800" : "border-transparent text-slate-600 hover:text-slate-950"}`} data-module-key={module.key} key={module.key} onClick={() => requestModuleSwitch(module.key)} ref={(node) => { if (node) moduleButtonRefs.current.set(module.key, node); else moduleButtonRefs.current.delete(module.key); }} role="tab" type="button">{module.label}</button>
          ))}
        </div>
      </nav>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div><h2 className="text-xl font-bold text-slate-950">{selectedModule.label}</h2><p className="mt-1 text-xs text-slate-500">修订版本 {selectedModule.revision ?? "未提供"}</p></div>
        <div aria-label="编辑模式" className="flex border border-slate-300" role="group">
          <button aria-pressed={mode === "form"} className={`px-3 py-2 text-sm font-semibold ${mode === "form" ? "bg-slate-900 text-white" : "bg-white text-slate-700"}`} onClick={() => setMode("form")} type="button">表单</button>
          <button aria-pressed={mode === "json"} className={`border-l border-slate-300 px-3 py-2 text-sm font-semibold ${mode === "json" ? "bg-slate-900 text-white" : "bg-white text-slate-700"}`} onClick={() => setMode("json")} type="button">JSON</button>
        </div>
      </div>

      <div className="mt-6" role="tabpanel">
        {mode === "json" ? (
          <label className="block text-sm font-semibold text-slate-700">高级 JSON 内容<textarea aria-invalid={Boolean(jsonError)} className="mt-2 min-h-[32rem] w-full border border-slate-300 bg-slate-950 p-4 font-mono text-sm leading-6 text-slate-100 outline-none focus:border-cyan-500" onChange={(event) => updateJson(event.target.value)} spellCheck={false} value={jsonSource} /></label>
        ) : selectedModule.key === "team-members" ? <TeamEditor onChange={updateDraft} value={draftValue} /> : <PageEditor onChange={updateDraft} value={draftValue} />}
        {jsonError ? <p className="mt-3 text-sm font-semibold text-red-700" role="alert">JSON 格式错误：{jsonError}</p> : null}
      </div>

      <p aria-live="polite" className={`mt-6 border-l-2 px-4 py-3 text-sm ${conflict ? "border-amber-500 bg-amber-50 text-amber-950" : message ? "border-cyan-600 bg-white text-slate-700" : "sr-only"}`} role={conflict ? "alert" : "status"}>{message || "编辑器已就绪"}</p>
      {conflict ? <div className="mt-3 flex flex-wrap gap-3"><button className="bg-blue-950 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-400" disabled={conflictRefreshing} onClick={() => void resolveConflict("reload")} type="button">重新加载最新版本</button><button className="border border-slate-400 bg-white px-4 py-2 text-sm font-bold text-slate-800 disabled:text-slate-400" disabled={conflictRefreshing} onClick={() => void resolveConflict("keep-local")} type="button">保留本地更改</button></div> : null}
      <p className="mt-6 text-xs leading-5 text-slate-500">媒体上传尚未开放。图片、PDF 等字段只能填写已有 URL 或资产引用。</p>
      </fieldset>

      {pendingKey ? <DiscardDialog onCancel={() => setPendingKey(null)} onDiscard={discardAndSwitch} restoreFocusTo={pendingTriggerRef.current} /> : null}
    </section>
  );
}
