"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  batchLabAssets,
  commitLabAssetImport,
  LabAssetsRequestError,
  mutateLabAssets,
  readLabAssetsError,
} from "./api";
import { AssetWorkbench } from "./AssetWorkbench";
import type { AssetImportRow } from "./import-export";
import { getTrappedFocusIndex } from "./dialog-keyboard";
import {
  canWriteLabAssets,
  groupAssetsByType,
  normalizeLabAssetsSnapshot,
  type LabAsset,
  type LabAssetsSnapshot,
  type LabPlatform,
  type LocalizedText,
} from "./model";

type Props = {
  initialView?: "overview" | "platforms" | "assets" | "requests";
  permissions: string[];
  userId: string;
};
type View = "overview" | "platforms" | "assets" | "requests";
type Editor =
  | { kind: "asset"; originalCode?: string; value: LabAsset }
  | { kind: "platform"; originalCode?: string; value: LabPlatform }
  | { kind: "deviceType"; code: string; name: string }
  | { kind: "platformType"; code: string; name: string }
  | null;

const field =
  "w-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-cyan-600";
const primary =
  "bg-blue-950 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-400";
const secondary =
  "border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-cyan-700";
const danger =
  "border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50";
const assetStatuses = [
  "idle",
  "in_use",
  "mounted",
  "maintenance",
  "lend",
  "retired",
] as const;
const platformStatuses = [
  "active",
  "maintenance",
  "building",
  "lend",
  "retired",
] as const;
const assetStatusLabels: Record<string, string> = {
  idle: "闲置",
  in_use: "使用中",
  mounted: "已装载",
  maintenance: "维护中",
  lend: "借出",
  retired: "报废",
};
const platformStatusLabels: Record<string, string> = {
  active: "运行中",
  maintenance: "维护中",
  building: "搭建中",
  lend: "借出",
  retired: "报废",
};
const requestStatusLabels: Record<string, string> = {
  pending: "待审批",
  approved: "已批准",
  rejected: "已驳回",
  cancelled: "已取消",
};

function emptyText(): LocalizedText {
  return { zh: "", en: "" };
}
function emptyAsset(typeCode: string): LabAsset {
  return {
    code: "",
    currentPlatformCode: null,
    description: emptyText(),
    deviceTypeCode: typeCode,
    deviceTypeName: "",
    model: "",
    name: emptyText(),
    vendorSerial: "",
    status: "idle",
    assignedUserId: null,
    assignedUserName: "",
    borrowerName: "",
    borrowerContact: "",
    storageLocation: null,
    updatedAt: "",
  };
}
function emptyPlatform(typeCode: string): LabPlatform {
  return {
    assetCodes: [],
    code: "",
    description: emptyText(),
    name: emptyText(),
    status: "building",
    typeCode,
  };
}
function slug(value: string, prefix: string) {
  const code = value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-|-$/g, "");
  return code || `${prefix}-${Date.now()}`;
}

function LocalizedFields({
  label,
  onChange,
  textarea = false,
  value,
}: {
  label: string;
  onChange: (value: LocalizedText) => void;
  textarea?: boolean;
  value: LocalizedText;
}) {
  const Element = textarea ? "textarea" : "input";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-semibold text-slate-700">
        {label}（中文）
        <Element
          className={`${field} mt-1 ${textarea ? "min-h-24" : ""}`}
          onChange={(event) => onChange({ ...value, zh: event.target.value })}
          value={value.zh}
        />
      </label>
      <label className="text-sm font-semibold text-slate-700">
        {label}（English）
        <Element
          className={`${field} mt-1 ${textarea ? "min-h-24" : ""}`}
          onChange={(event) => onChange({ ...value, en: event.target.value })}
          value={value.en}
        />
      </label>
    </div>
  );
}
function StatusBadge({
  labels,
  status,
}: {
  labels: Record<string, string>;
  status: string;
}) {
  const tone =
    status === "idle" || status === "active" || status === "approved"
      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
      : status === "pending" || status === "building"
        ? "border-amber-300 bg-amber-50 text-amber-800"
        : status === "retired" || status === "rejected"
          ? "border-red-300 bg-red-50 text-red-800"
          : "border-slate-300 bg-slate-50 text-slate-700";
  return (
    <span
      className={`inline-flex border px-2 py-1 text-xs font-semibold ${tone}`}
    >
      {labels[status] ?? status}
    </span>
  );
}
function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-l-2 border-cyan-600 bg-white px-4 py-3">
      <strong className="block font-mono text-2xl text-slate-950">
        {value}
      </strong>
      <span className="mt-1 block text-xs font-semibold text-slate-500">
        {label}
      </span>
    </div>
  );
}
function assignment(item: LabAsset) {
  if (item.status === "mounted") return `平台 ${item.currentPlatformCode}`;
  if (item.status === "in_use")
    return `使用人 ${item.assignedUserName || "未设置"}`;
  if (item.status === "lend")
    return `借用人 ${item.borrowerName} · ${item.borrowerContact}`;
  return "无占用关系";
}

export function LabAssetsConsole({
  initialView = "overview",
  permissions,
  userId,
}: Props) {
  const writable = canWriteLabAssets(permissions);
  const [snapshot, setSnapshot] = useState<LabAssetsSnapshot | null>(null),
    [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
      "loading",
    ),
    [view, setView] = useState<View>(initialView),
    [editor, setEditor] = useState<Editor>(null),
    [returnEditor, setReturnEditor] = useState<Editor>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [revisionConflict, setRevisionConflict] = useState(false),
    [assetPickerQuery, setAssetPickerQuery] = useState(""),
    [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const dialogRef = useRef<HTMLDialogElement>(null),
    firstEditorInputRef = useRef<HTMLInputElement>(null),
    editorTriggerRef = useRef<HTMLElement | null>(null);
  const editorOpen = editor !== null;
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoadState("loading");
    try {
      const response = await fetch("/api/lab-assets", { cache: "no-store" });
      if (!response.ok) throw new Error(await readLabAssetsError(response));
      const next = normalizeLabAssetsSnapshot(await response.json());
      setSnapshot(next);
      setLoadState("ready");
      return next;
    } catch (error) {
      setLoadState("error");
      setMessage(
        error instanceof Error ? error.message : "无法加载实验室资产。",
      );
      return null;
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
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
  const pickerAssets = useMemo(() => {
    if (!snapshot || editor?.kind !== "platform") return [];
    const query = assetPickerQuery.trim().toLocaleLowerCase();
    return snapshot.assets.filter((item) => {
      const haystack = [
        item.code,
        item.name.zh,
        item.name.en,
        item.model,
        item.deviceTypeName,
        item.currentPlatformCode ?? "",
        item.assignedUserName,
      ]
        .join(" ")
        .toLocaleLowerCase();
      return !query || haystack.includes(query);
    });
  }, [assetPickerQuery, editor, snapshot]);

  function openEditor(next: Exclude<Editor, null>) {
    editorTriggerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setAssetPickerQuery("");
    setEditor(next);
  }
  function closeEditor() {
    setEditor(null);
    setReturnEditor(null);
  }
  function cancelEditor() {
    if (returnEditor) {
      setEditor(returnEditor);
      setReturnEditor(null);
    } else closeEditor();
  }
  function handleDialogKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEditor();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])",
      ) ?? [],
    );
    const next = getTrappedFocusIndex(
      focusable.indexOf(document.activeElement as HTMLElement),
      focusable.length,
      event.shiftKey,
    );
    if (next === null) return;
    event.preventDefault();
    focusable[next]?.focus();
  }
  async function mutate(
    endpoint: string,
    method: "POST" | "PUT" | "DELETE",
    body: Record<string, unknown>,
    success: string,
    close = true,
  ) {
    if (!snapshot) return null;
    setBusy(true);
    setMessage("");
    setRevisionConflict(false);
    try {
      await mutateLabAssets(endpoint, method, body);
      const next = await load(true);
      if (next) {
        setMessage(success);
        if (close) closeEditor();
      }
      return next;
    } catch (error) {
      setRevisionConflict(
        error instanceof LabAssetsRequestError && error.status === 409,
      );
      setMessage(
        error instanceof Error ? error.message : "操作失败，请稍后重试。",
      );
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function saveEditor() {
    if (!snapshot || !editor) return;
    if (editor.kind === "asset") {
      const item = editor.value;
      const body = {
        code: item.code,
        deviceTypeCode: item.deviceTypeCode,
        model: item.model,
        name: item.name,
        description: item.description,
        vendorSerial: item.vendorSerial,
        status: item.status,
        currentPlatformCode:
          item.status === "mounted" ? item.currentPlatformCode : null,
        assignedUserId: item.status === "in_use" ? item.assignedUserId : null,
        borrowerName: item.status === "lend" ? item.borrowerName : "",
        borrowerContact: item.status === "lend" ? item.borrowerContact : "",
        storageLocation: item.storageLocation,
        expectedRevision: snapshot.revision,
      };
      await mutate(
        editor.originalCode
          ? `/assets/${encodeURIComponent(editor.originalCode)}`
          : "/assets",
        editor.originalCode ? "PUT" : "POST",
        body,
        "设备信息已保存。",
      );
    } else if (editor.kind === "platform") {
      await mutate(
        editor.originalCode
          ? `/platforms/${encodeURIComponent(editor.originalCode)}`
          : "/platforms",
        editor.originalCode ? "PUT" : "POST",
        { ...editor.value, expectedRevision: snapshot.revision },
        "平台信息已保存。",
      );
    } else {
      const createdCode =
          editor.code ||
          slug(
            editor.name,
            editor.kind === "deviceType" ? "device" : "platform",
          ),
        kind = editor.kind;
      const endpoint =
        kind === "deviceType" ? "/device-types" : "/platform-types";
      const next = await mutate(
        endpoint,
        "POST",
        {
          code: createdCode,
          name: editor.name,
          expectedRevision: snapshot.revision,
        },
        "类型已创建。",
        false,
      );
      if (next && returnEditor) {
        setEditor(
          returnEditor.kind === "asset" && kind === "deviceType"
            ? {
                ...returnEditor,
                value: { ...returnEditor.value, deviceTypeCode: createdCode },
              }
            : returnEditor.kind === "platform" && kind === "platformType"
              ? {
                  ...returnEditor,
                  value: { ...returnEditor.value, typeCode: createdCode },
                }
              : returnEditor,
        );
        setReturnEditor(null);
      } else if (next) closeEditor();
    }
  }
  async function remove(kind: "asset" | "platform", code: string) {
    if (!snapshot || !window.confirm(`确定删除 ${code}？`)) return;
    await mutate(
      `/${kind === "asset" ? "assets" : "platforms"}/${encodeURIComponent(code)}`,
      "DELETE",
      { expectedRevision: snapshot.revision },
      `${code} 已删除。`,
    );
  }
  async function requestUsage(assetCode: string, reason = "") {
    if (!snapshot) return false;
    return Boolean(
      await mutate(
        "/usage-requests",
        "POST",
        { assetCode, reason, expectedRevision: snapshot.revision },
        "设备使用申请已提交。",
      ),
    );
  }
  async function batchAssets(
    action: "set_status" | "set_device_type" | "set_platform" | "set_location",
    value: string | null,
    assetCodes: string[],
  ) {
    if (!snapshot) return false;
    setBusy(true);
    setMessage("");
    setRevisionConflict(false);
    try {
      await batchLabAssets({
        action,
        value,
        assetCodes,
        expectedRevision: snapshot.revision,
      });
      const next = await load(true);
      if (next) setMessage(`已批量更新 ${assetCodes.length} 台设备。`);
      return Boolean(next);
    } catch (error) {
      setRevisionConflict(
        error instanceof LabAssetsRequestError && error.status === 409,
      );
      setMessage(
        error instanceof Error ? error.message : "批量更新失败，请稍后重试。",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function importAssets(
    rows: AssetImportRow[],
    createMissingDeviceTypes: boolean,
  ) {
    if (!snapshot) return false;
    setBusy(true);
    setMessage("");
    setRevisionConflict(false);
    try {
      await commitLabAssetImport({
        rows,
        expectedRevision: snapshot.revision,
        createMissingDeviceTypes,
      });
      const next = await load(true);
      if (next) setMessage(`已导入 ${rows.length} 台设备。`);
      return Boolean(next);
    } catch (error) {
      setRevisionConflict(
        error instanceof LabAssetsRequestError && error.status === 409,
      );
      setMessage(
        error instanceof Error ? error.message : "资产导入失败，请稍后重试。",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function reviewRequest(id: string, action: "approve" | "reject") {
    if (!snapshot) return;
    await mutate(
      `/usage-requests/${encodeURIComponent(id)}/review`,
      "POST",
      {
        action,
        note: reviewNotes[id] ?? "",
        expectedRevision: snapshot.revision,
      },
      action === "approve" ? "申请已批准。" : "申请已驳回。",
    );
  }
  if (loadState === "loading")
    return (
      <section aria-busy="true">
        <p className="text-sm font-semibold text-cyan-700">实验室资产</p>
        <h1 className="mt-2 font-serif text-3xl font-bold">
          正在加载资产台账...
        </h1>
      </section>
    );
  if (loadState === "error" || !snapshot)
    return (
      <section>
        <p className="text-sm font-semibold text-cyan-700">实验室资产</p>
        <h1 className="mt-2 font-serif text-3xl font-bold">无法加载资产台账</h1>
        <p className="mt-4 text-red-700" role="alert">
          {message}
        </p>
        <button
          className={`${primary} mt-6`}
          onClick={() => void load()}
          type="button"
        >
          重试
        </button>
      </section>
    );
  const views: View[] = ["overview", "platforms", "assets", "requests"];
  return (
    <section aria-labelledby="lab-assets-heading">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-slate-300 pb-5">
        <div>
          <p className="text-sm font-semibold text-cyan-700">内部资源</p>
          <h1
            className="mt-2 font-serif text-3xl font-bold text-slate-950"
            id="lab-assets-heading"
          >
            实验室资产
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            直观查看设备所在平台、使用成员和借出状态
          </p>
        </div>
        <div className="text-right">
          <span
            className={`inline-flex border bg-white px-3 py-1 text-xs font-bold ${writable ? "border-cyan-600 text-cyan-900" : "border-slate-300 text-slate-700"}`}
          >
            {writable ? "资产管理员" : "成员账号"}
          </span>
          <p className="mt-2 text-xs text-slate-500">
            修订版本 {snapshot.revision}
          </p>
        </div>
      </header>
      <nav
        aria-label="资产模块视图"
        className="mt-5 flex gap-1 overflow-x-auto border-b border-slate-300"
      >
        {views.map((item) => (
          <button
            aria-current={view === item ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold ${view === item ? "border-cyan-700 text-cyan-800" : "border-transparent text-slate-600"}`}
            key={item}
            onClick={() => {
              setView(item);
              closeEditor();
            }}
            type="button"
          >
            {
              {
                overview: "台账总览",
                platforms: "平台",
                assets: "设备",
                requests: writable ? "使用申请审批" : "我的使用申请",
              }[item]
            }
          </button>
        ))}
      </nav>
      {message ? (
        <div
          className="mt-5 border border-cyan-200 bg-white px-4 py-3 text-sm text-slate-700"
          role={revisionConflict ? "alert" : "status"}
        >
          {message}
          {revisionConflict ? (
            <button
              className="ml-4 font-bold text-cyan-800 underline"
              onClick={() => {
                setRevisionConflict(false);
                void load(true);
              }}
              type="button"
            >
              刷新数据
            </button>
          ) : null}
        </div>
      ) : null}

      {view === "overview" ? (
        <div className="mt-6 space-y-8">
          <div className="grid gap-px border border-slate-200 bg-slate-200 sm:grid-cols-3 xl:grid-cols-7">
            <Metric label="设备总数" value={snapshot.stats.totalAssets ?? 0} />
            <Metric label="闲置设备" value={snapshot.stats.idleAssets ?? 0} />
            <Metric
              label="使用中设备"
              value={snapshot.stats.inUseAssets ?? 0}
            />
            <Metric
              label="已装载设备"
              value={snapshot.stats.mountedAssets ?? 0}
            />
            <Metric label="借出设备" value={snapshot.stats.lentAssets ?? 0} />
            <Metric
              label="维护中设备"
              value={snapshot.stats.maintenanceAssets ?? 0}
            />
            <Metric
              label="待审批申请"
              value={snapshot.stats.pendingRequests ?? 0}
            />
          </div>
          <section>
            <h2 className="text-xl font-bold text-slate-950">平台与组成设备</h2>
            <p className="mt-1 text-sm text-slate-600">
              按平台类型分组，平台内直接展示设备信息。
            </p>
            <div className="mt-4 space-y-6">
              {snapshot.platformTypes.map((type) => (
                <div key={type.code}>
                  <h3 className="border-b border-slate-300 pb-2 text-sm font-bold text-cyan-800">
                    {type.name}
                  </h3>
                  <div className="grid gap-px border-x border-b border-slate-200 bg-slate-200 lg:grid-cols-2">
                    {type.platforms.map((platform) => (
                      <article className="bg-white p-4" key={platform.code}>
                        <div className="flex justify-between gap-3">
                          <div>
                            <strong className="font-mono">
                              {platform.code}
                            </strong>
                            <p className="mt-1 font-semibold">
                              {platform.name.zh || platform.name.en}
                            </p>
                          </div>
                          <StatusBadge
                            labels={platformStatusLabels}
                            status={platform.status}
                          />
                        </div>
                        <p className="mt-3 text-sm text-slate-600">
                          {platform.description.zh ||
                            platform.description.en ||
                            "暂无备注说明"}
                        </p>
                        <div className="mt-4 space-y-2">
                          {platform.assetCodes.map((code) => {
                            const asset = snapshot.assets.find(
                              (item) => item.code === code,
                            );
                            return asset ? (
                              <button
                                className="flex w-full items-center justify-between border border-slate-200 px-3 py-2 text-left hover:border-cyan-600"
                                key={code}
                                onClick={() => {
                                  setView("assets");
                                }}
                                type="button"
                              >
                                <span>
                                  <b className="font-mono text-xs">
                                    {asset.code}
                                  </b>
                                  <span className="ml-2 text-sm">
                                    {asset.name.zh || asset.name.en}
                                  </span>
                                  <span className="ml-2 text-xs text-slate-500">
                                    {asset.model}
                                  </span>
                                </span>
                                <StatusBadge
                                  labels={assetStatusLabels}
                                  status={asset.status}
                                />
                              </button>
                            ) : null;
                          })}
                          {!platform.assetCodes.length ? (
                            <p className="text-xs text-slate-400">
                              暂无装载设备
                            </p>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h2 className="text-xl font-bold text-slate-950">设备总览</h2>
            <p className="mt-1 text-sm text-slate-600">
              按设备类型分组、按编号排序。
            </p>
            <div className="mt-4 space-y-5">
              {groupAssetsByType(snapshot.assets).map((group) => (
                <div key={group.name}>
                  <h3 className="border-b border-slate-300 pb-2 text-sm font-bold text-cyan-800">
                    {group.name} · {group.items.length} 台
                  </h3>
                  <div className="grid gap-px border-x border-b border-slate-200 bg-slate-200 md:grid-cols-2 xl:grid-cols-3">
                    {group.items.map((item) => (
                      <button
                        className="bg-white p-4 text-left hover:bg-cyan-50"
                        key={item.code}
                        onClick={() => {
                          setView("assets");
                        }}
                        type="button"
                      >
                        <div className="flex justify-between gap-2">
                          <strong className="font-mono text-sm">
                            {item.code}
                          </strong>
                          <StatusBadge
                            labels={assetStatusLabels}
                            status={item.status}
                          />
                        </div>
                        <p className="mt-2 font-semibold">
                          {item.name.zh || item.name.en}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.model || "无型号"} · {assignment(item)}
                        </p>
                        <p className="mt-2 line-clamp-2 text-xs text-slate-600">
                          {item.description.zh ||
                            item.description.en ||
                            "暂无备注说明"}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {view === "platforms" ? (
        <div className="mt-6 space-y-7">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">平台管理</h2>
              <p className="mt-1 text-sm text-slate-600">
                按平台类型分组、按编号排序，编辑平台可批量选择组成设备。
              </p>
            </div>
            {writable ? (
              <div className="flex gap-2">
                <button
                  className={secondary}
                  onClick={() => {
                    setReturnEditor(editor);
                    openEditor({ kind: "platformType", code: "", name: "" });
                  }}
                  type="button"
                >
                  新建平台类型
                </button>
                <button
                  className={primary}
                  disabled={!snapshot.platformTypes.length}
                  onClick={() =>
                    openEditor({
                      kind: "platform",
                      value: emptyPlatform(
                        snapshot.platformTypes[0]?.code ?? "",
                      ),
                    })
                  }
                  type="button"
                >
                  新增平台
                </button>
              </div>
            ) : null}
          </div>
          {snapshot.platformTypes.map((type) => (
            <section key={type.code}>
              <h3 className="border-b border-slate-300 pb-2 font-bold text-cyan-800">
                {type.name}
              </h3>
              <div className="grid gap-px border-x border-b border-slate-200 bg-slate-200 md:grid-cols-2 xl:grid-cols-3">
                {type.platforms.map((item) => (
                  <article className="bg-white p-5" key={item.code}>
                    <div className="flex justify-between gap-3">
                      <div>
                        <strong className="font-mono">{item.code}</strong>
                        <p className="mt-1 font-semibold">
                          {item.name.zh || item.name.en}
                        </p>
                      </div>
                      <StatusBadge
                        labels={platformStatusLabels}
                        status={item.status}
                      />
                    </div>
                    <p className="mt-3 min-h-10 text-sm text-slate-600">
                      {item.description.zh ||
                        item.description.en ||
                        "暂无备注说明"}
                    </p>
                    <p className="mt-4 text-xs font-semibold text-slate-500">
                      组成设备 {item.assetCodes.length} 台
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.assetCodes.map((code) => (
                        <span
                          className="border border-slate-300 px-2 py-1 font-mono text-xs"
                          key={code}
                        >
                          {code}
                        </span>
                      ))}
                    </div>
                    {writable ? (
                      <div className="mt-5 flex gap-2">
                        <button
                          className={primary}
                          onClick={() =>
                            openEditor({
                              kind: "platform",
                              originalCode: item.code,
                              value: structuredClone(item),
                            })
                          }
                          type="button"
                        >
                          编辑
                        </button>
                        <button
                          className={danger}
                          onClick={() => void remove("platform", item.code)}
                          type="button"
                        >
                          删除
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {view === "assets" ? (
        <AssetWorkbench
          busy={busy}
          onAdd={() =>
            openEditor({
              kind: "asset",
              value: emptyAsset(snapshot.deviceTypes[0]?.code ?? ""),
            })
          }
          onBatch={batchAssets}
          onDelete={(asset) => void remove("asset", asset.code)}
          onEdit={(asset) =>
            openEditor({
              kind: "asset",
              originalCode: asset.code,
              value: structuredClone(asset),
            })
          }
          onImport={importAssets}
          onRequest={requestUsage}
          snapshot={snapshot}
          userId={userId}
          writable={writable}
        />
      ) : null}

      {view === "requests" ? (
        <div className="mt-6">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-xl font-bold">
                {writable ? "设备使用申请审批" : "我的设备使用申请"}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {writable
                  ? "审批非闲置设备的使用申请，批准后设备自动转为使用中。"
                  : "查看自己的申请及处理结果。"}
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {snapshot.usageRequests.map((request) => (
              <article
                className="border border-slate-200 bg-white p-4"
                key={request.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs font-bold text-cyan-700">
                      {request.assetCode}
                    </p>
                    <h3 className="mt-1 font-bold">
                      {request.assetName.zh || request.assetName.en}
                    </h3>
                    <p className="mt-2 text-sm text-slate-600">
                      申请人：{request.requesterName}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      用途：{request.reason || "未填写"}
                    </p>
                    {request.reviewNote ? (
                      <p className="mt-1 text-sm text-slate-600">
                        处理意见：{request.reviewNote}
                      </p>
                    ) : null}
                  </div>
                  <StatusBadge
                    labels={requestStatusLabels}
                    status={request.status}
                  />
                </div>
                {writable && request.status === "pending" ? (
                  <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
                    <label className="text-xs font-semibold">
                      处理意见
                      <input
                        className={`${field} mt-1`}
                        onChange={(event) =>
                          setReviewNotes({
                            ...reviewNotes,
                            [request.id]: event.target.value,
                          })
                        }
                        value={reviewNotes[request.id] ?? ""}
                      />
                    </label>
                    <button
                      className={primary}
                      disabled={busy}
                      onClick={() => void reviewRequest(request.id, "approve")}
                      type="button"
                    >
                      批准
                    </button>
                    <button
                      className={danger}
                      disabled={busy}
                      onClick={() => void reviewRequest(request.id, "reject")}
                      type="button"
                    >
                      驳回
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
            {!snapshot.usageRequests.length ? (
              <p className="border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                暂无设备使用申请。
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {editor ? (
        <dialog
          aria-labelledby="asset-editor-title"
          className="m-auto w-[calc(100%-2rem)] max-w-4xl border-0 bg-transparent p-0 backdrop:bg-slate-950/50"
          onCancel={(event) => {
            event.preventDefault();
            cancelEditor();
          }}
          onKeyDown={handleDialogKeyDown}
          ref={dialogRef}
        >
          <form
            className="max-h-[90vh] overflow-y-auto border-t-4 border-cyan-600 bg-white p-6 shadow-2xl"
            onSubmit={(event) => {
              event.preventDefault();
              void saveEditor();
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-cyan-700">资产管理</p>
                <h2 className="mt-1 text-2xl font-bold" id="asset-editor-title">
                  {editor.kind === "asset"
                    ? `${editor.originalCode ? "编辑" : "新增"}设备`
                    : editor.kind === "platform"
                      ? `${editor.originalCode ? "编辑" : "新增"}平台`
                      : editor.kind === "deviceType"
                        ? "新建设备类型"
                        : "新建平台类型"}
                </h2>
              </div>
              <button
                aria-label="关闭编辑器"
                className="text-2xl text-slate-500"
                onClick={cancelEditor}
                type="button"
              >
                ×
              </button>
            </div>
            <div className="mt-6 grid gap-4">
              {editor.kind === "asset" ? (
                <>
                  <label className="text-sm font-semibold">
                    编号
                    <input
                      className={`${field} mt-1`}
                      onChange={(event) =>
                        setEditor({
                          ...editor,
                          value: { ...editor.value, code: event.target.value },
                        })
                      }
                      ref={firstEditorInputRef}
                      required
                      value={editor.value.code}
                    />
                  </label>
                  <LocalizedFields
                    label="名称"
                    onChange={(name) =>
                      setEditor({ ...editor, value: { ...editor.value, name } })
                    }
                    value={editor.value.name}
                  />
                  <LocalizedFields
                    label="备注说明"
                    onChange={(description) =>
                      setEditor({
                        ...editor,
                        value: { ...editor.value, description },
                      })
                    }
                    textarea
                    value={editor.value.description}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm font-semibold">
                      设备类型
                      <select
                        className={`${field} mt-1`}
                        onChange={(event) =>
                          setEditor({
                            ...editor,
                            value: {
                              ...editor.value,
                              deviceTypeCode: event.target.value,
                            },
                          })
                        }
                        value={editor.value.deviceTypeCode}
                      >
                        {snapshot.deviceTypes.map((item) => (
                          <option key={item.code} value={item.code}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className={`${secondary} self-end`}
                      onClick={() => {
                        setReturnEditor(editor);
                        openEditor({ kind: "deviceType", code: "", name: "" });
                      }}
                      type="button"
                    >
                      新建设备类型
                    </button>
                    <label className="text-sm font-semibold">
                      设备型号
                      <input
                        className={`${field} mt-1`}
                        onChange={(event) =>
                          setEditor({
                            ...editor,
                            value: {
                              ...editor.value,
                              model: event.target.value,
                            },
                          })
                        }
                        value={editor.value.model}
                      />
                    </label>
                    <label className="text-sm font-semibold">
                      厂商序列号
                      <input
                        className={`${field} mt-1`}
                        onChange={(event) =>
                          setEditor({
                            ...editor,
                            value: {
                              ...editor.value,
                              vendorSerial: event.target.value,
                            },
                          })
                        }
                        value={editor.value.vendorSerial}
                      />
                    </label>
                    <label className="text-sm font-semibold">
                      存放位置
                      <input
                        className={`${field} mt-1`}
                        onChange={(event) =>
                          setEditor({
                            ...editor,
                            value: {
                              ...editor.value,
                              storageLocation: event.target.value || null,
                            },
                          })
                        }
                        placeholder="例如：东区实验室 A-03"
                        value={editor.value.storageLocation ?? ""}
                      />
                    </label>
                    <label className="text-sm font-semibold">
                      状态
                      <select
                        className={`${field} mt-1`}
                        onChange={(event) => {
                          const status = event.target
                            .value as LabAsset["status"];
                          setEditor({
                            ...editor,
                            value: {
                              ...editor.value,
                              status,
                              currentPlatformCode:
                                status === "mounted"
                                  ? editor.value.currentPlatformCode
                                  : null,
                              assignedUserId:
                                status === "in_use"
                                  ? editor.value.assignedUserId
                                  : null,
                              borrowerName:
                                status === "lend"
                                  ? editor.value.borrowerName
                                  : "",
                              borrowerContact:
                                status === "lend"
                                  ? editor.value.borrowerContact
                                  : "",
                            },
                          });
                        }}
                        value={editor.value.status}
                      >
                        {assetStatuses.map((status) => (
                          <option key={status} value={status}>
                            {assetStatusLabels[status]}
                          </option>
                        ))}
                      </select>
                    </label>
                    {editor.value.status === "mounted" ? (
                      <label className="text-sm font-semibold">
                        装载平台
                        <select
                          className={`${field} mt-1`}
                          onChange={(event) =>
                            setEditor({
                              ...editor,
                              value: {
                                ...editor.value,
                                currentPlatformCode: event.target.value || null,
                              },
                            })
                          }
                          required
                          value={editor.value.currentPlatformCode ?? ""}
                        >
                          <option value="">请选择平台</option>
                          {snapshot.platforms.map((item) => (
                            <option key={item.code} value={item.code}>
                              {item.code} · {item.name.zh || item.name.en}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {editor.value.status === "in_use" ? (
                      <label className="text-sm font-semibold">
                        使用成员
                        <select
                          className={`${field} mt-1`}
                          onChange={(event) =>
                            setEditor({
                              ...editor,
                              value: {
                                ...editor.value,
                                assignedUserId: event.target.value || null,
                              },
                            })
                          }
                          required
                          value={editor.value.assignedUserId ?? ""}
                        >
                          <option value="">请选择成员</option>
                          {snapshot.members.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.displayName} (@{item.username})
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {editor.value.status === "lend" ? (
                      <>
                        <label className="text-sm font-semibold">
                          借用者名称
                          <input
                            className={`${field} mt-1`}
                            onChange={(event) =>
                              setEditor({
                                ...editor,
                                value: {
                                  ...editor.value,
                                  borrowerName: event.target.value,
                                },
                              })
                            }
                            required
                            value={editor.value.borrowerName}
                          />
                        </label>
                        <label className="text-sm font-semibold">
                          联系方式
                          <input
                            className={`${field} mt-1`}
                            onChange={(event) =>
                              setEditor({
                                ...editor,
                                value: {
                                  ...editor.value,
                                  borrowerContact: event.target.value,
                                },
                              })
                            }
                            required
                            value={editor.value.borrowerContact}
                          />
                        </label>
                      </>
                    ) : null}
                  </div>
                </>
              ) : editor.kind === "platform" ? (
                <>
                  <label className="text-sm font-semibold">
                    编号
                    <input
                      className={`${field} mt-1`}
                      onChange={(event) =>
                        setEditor({
                          ...editor,
                          value: { ...editor.value, code: event.target.value },
                        })
                      }
                      ref={firstEditorInputRef}
                      required
                      value={editor.value.code}
                    />
                  </label>
                  <LocalizedFields
                    label="名称"
                    onChange={(name) =>
                      setEditor({ ...editor, value: { ...editor.value, name } })
                    }
                    value={editor.value.name}
                  />
                  <LocalizedFields
                    label="备注说明"
                    onChange={(description) =>
                      setEditor({
                        ...editor,
                        value: { ...editor.value, description },
                      })
                    }
                    textarea
                    value={editor.value.description}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm font-semibold">
                      平台类型
                      <select
                        className={`${field} mt-1`}
                        onChange={(event) =>
                          setEditor({
                            ...editor,
                            value: {
                              ...editor.value,
                              typeCode: event.target.value,
                            },
                          })
                        }
                        value={editor.value.typeCode}
                      >
                        {snapshot.platformTypes.map((item) => (
                          <option key={item.code} value={item.code}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className={`${secondary} self-end`}
                      onClick={() => {
                        setReturnEditor(editor);
                        openEditor({
                          kind: "platformType",
                          code: "",
                          name: "",
                        });
                      }}
                      type="button"
                    >
                      新建平台类型
                    </button>
                    <label className="text-sm font-semibold">
                      状态
                      <select
                        className={`${field} mt-1`}
                        onChange={(event) =>
                          setEditor({
                            ...editor,
                            value: {
                              ...editor.value,
                              status: event.target
                                .value as LabPlatform["status"],
                            },
                          })
                        }
                        value={editor.value.status}
                      >
                        {platformStatuses.map((status) => (
                          <option key={status} value={status}>
                            {platformStatusLabels[status]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <section>
                    <div>
                      <h3 className="text-sm font-bold">组成设备</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        搜索后勾选，可多选；取消勾选会让设备自动变为闲置。
                      </p>
                    </div>
                    <input
                      className={`${field} mt-3`}
                      onChange={(event) =>
                        setAssetPickerQuery(event.target.value)
                      }
                      placeholder="搜索设备编号、名称、型号或类型"
                      value={assetPickerQuery}
                    />
                    <div className="mt-3 max-h-72 overflow-y-auto border border-slate-200">
                      {pickerAssets.map((item) => (
                        <label
                          className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0"
                          key={item.code}
                        >
                          <span>
                            <b className="font-mono text-xs">{item.code}</b>
                            <span className="ml-2 text-sm">
                              {item.name.zh || item.name.en}
                            </span>
                            <span className="ml-2 text-xs text-slate-500">
                              {item.deviceTypeName} · {item.model}
                            </span>
                          </span>
                          <input
                            checked={editor.value.assetCodes.includes(
                              item.code,
                            )}
                            onChange={(event) =>
                              setEditor({
                                ...editor,
                                value: {
                                  ...editor.value,
                                  assetCodes: event.target.checked
                                    ? [...editor.value.assetCodes, item.code]
                                    : editor.value.assetCodes.filter(
                                        (code) => code !== item.code,
                                      ),
                                },
                              })
                            }
                            type="checkbox"
                          />
                        </label>
                      ))}
                    </div>
                  </section>
                </>
              ) : (
                <>
                  <label className="text-sm font-semibold">
                    类型名称
                    <input
                      className={`${field} mt-1`}
                      onChange={(event) =>
                        setEditor({
                          ...editor,
                          name: event.target.value,
                          code:
                            editor.code ||
                            slug(
                              event.target.value,
                              editor.kind === "deviceType"
                                ? "device"
                                : "platform",
                            ),
                        })
                      }
                      ref={firstEditorInputRef}
                      required
                      value={editor.name}
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    类型代码
                    <input
                      className={`${field} mt-1`}
                      onChange={(event) =>
                        setEditor({ ...editor, code: event.target.value })
                      }
                      required
                      value={editor.code}
                    />
                  </label>
                </>
              )}
            </div>
            <div className="mt-7 flex justify-end gap-3">
              <button
                className={secondary}
                onClick={cancelEditor}
                type="button"
              >
                取消
              </button>
              <button className={primary} disabled={busy} type="submit">
                {busy ? "保存中..." : "保存"}
              </button>
            </div>
          </form>
        </dialog>
      ) : null}
    </section>
  );
}
