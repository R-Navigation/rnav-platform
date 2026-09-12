"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { ConsoleEmptyState } from "@/features/console/ui/ConsoleEmptyState";
import { ConsoleStatusBadge } from "@/features/console/ui/ConsoleStatusBadge";
import { AssetImportDialog } from "./AssetImportDialog";
import { AssetQrLabels } from "./AssetQrLabels";
import { InventoryDialog } from "./InventoryDialog";
import {
  downloadCsv,
  exportAssetsCsv,
  type AssetImportRow,
} from "./import-export";
import {
  filterAssets,
  groupAssets,
  type AssetFilters,
  type AssetGroupBy,
  type LabAsset,
  type LabAssetsSnapshot,
} from "./model";

type BatchAction =
  | "set_status"
  | "set_device_type"
  | "set_location";
type Props = {
  initialAssetCode?: string;
  busy: boolean;
  snapshot: LabAssetsSnapshot;
  userId: string;
  writable: boolean;
  onAdd(): void;
  onBatch(
    action: BatchAction,
    value: string | null,
    assetCodes: string[],
  ): Promise<boolean>;
  onDelete(asset: LabAsset): void;
  onEdit(asset: LabAsset): void;
  onImport(
    rows: AssetImportRow[],
    createMissingDeviceTypes: boolean,
  ): Promise<boolean>;
  onRequest(assetCode: string, reason: string): Promise<boolean>;
};

const field =
  "w-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100";
const primary =
  "bg-blue-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-800 active:translate-y-px disabled:cursor-not-allowed disabled:bg-slate-400";
const secondary =
  "border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-cyan-600 hover:text-cyan-800 active:translate-y-px";
const statusLabels: Record<LabAsset["displayState"], string> = {
  idle: "闲置",
  in_use: "使用中",
  mounted: "已装载",
  maintenance: "维护中",
  lend: "借出",
  retired: "报废",
};
const statusTone: Record<
  LabAsset["displayState"],
  "neutral" | "info" | "success" | "warning" | "danger"
> = {
  idle: "success",
  in_use: "info",
  mounted: "info",
  maintenance: "warning",
  lend: "warning",
  retired: "danger",
};

function assignment(item: LabAsset) {
  if (item.currentPlatformCode)
    return item.currentPlatformCode
      ? `平台 ${item.currentPlatformCode}`
      : "未分配平台";
  if (item.displayState === "in_use")
    return item.assignedUserName
      ? `使用人 ${item.assignedUserName}`
      : "未设置使用人";
  if (item.displayState === "lend")
    return item.borrowerName ? `借用人 ${item.borrowerName}` : "未填写借用人";
  return "无占用关系";
}

function AssetStatus({ asset }: { asset: LabAsset }) {
  return (
    <ConsoleStatusBadge tone={statusTone[asset.displayState]}>
      {statusLabels[asset.displayState]}
    </ConsoleStatusBadge>
  );
}

function AssetDrawer({
  asset,
  busy,
  userId,
  writable,
  onClose,
  onDelete,
  onEdit,
  onRequest,
}: {
  asset: LabAsset | null;
  busy: boolean;
  userId: string;
  writable: boolean;
  onClose(): void;
  onDelete(asset: LabAsset): void;
  onEdit(asset: LabAsset): void;
  onRequest(assetCode: string, reason: string): Promise<boolean>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const [tab, setTab] = useState<"details" | "usage" | "history">("details");
  const [reason, setReason] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!asset) return;
    triggerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog?.showModal();
    closeButtonRef.current?.focus();
    return () => {
      if (dialog?.open) dialog.close();
      triggerRef.current?.focus();
    };
  }, [asset]);

  if (!asset) return null;
  return (
    <dialog
      aria-labelledby="asset-drawer-title"
      className="h-dvh max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-slate-950/35"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      ref={dialogRef}
    >
      <div className="ml-auto flex h-dvh w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-[-16px_0_48px_rgba(15,23,42,0.16)]">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-7">
          <div className="min-w-0">
            <p className="font-mono text-xs font-semibold text-cyan-700">
              {asset.code}
            </p>
            <h2
              className="mt-1 truncate text-2xl font-semibold tracking-tight text-slate-950"
              id="asset-drawer-title"
            >
              {asset.name.zh || asset.name.en || asset.code}
            </h2>
            <div className="mt-3">
              <AssetStatus asset={asset} />
            </div>
          </div>
          <button
            aria-label="关闭设备详情"
            className="grid size-10 shrink-0 place-items-center border border-slate-200 text-xl text-slate-500 transition hover:border-cyan-500 hover:text-cyan-800"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            ×
          </button>
        </header>
        <nav
          aria-label="设备详情"
          className="flex border-b border-slate-200 px-5 sm:px-7"
        >
          {(["details", "usage", "history"] as const).map((item) => (
            <button
              aria-current={tab === item ? "page" : undefined}
              className={`border-b-2 px-3 py-3 text-sm font-semibold ${tab === item ? "border-cyan-600 text-cyan-900" : "border-transparent text-slate-500"}`}
              key={item}
              onClick={() => setTab(item)}
              type="button"
            >
              {
                { details: "基本信息", usage: "使用与位置", history: "历史" }[
                  item
                ]
              }
            </button>
          ))}
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7">
          {tab === "details" ? (
            <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-4 text-sm">
              <dt className="text-slate-500">设备类型</dt>
              <dd>{asset.deviceTypeName}</dd>
              <dt className="text-slate-500">型号</dt>
              <dd>{asset.model || "—"}</dd>
              <dt className="text-slate-500">厂商序列号</dt>
              <dd className="break-all font-mono text-xs">
                {asset.vendorSerial || "—"}
              </dd>
              <dt className="text-slate-500">中文名称</dt>
              <dd>{asset.name.zh || "—"}</dd>
              <dt className="text-slate-500">英文名称</dt>
              <dd>{asset.name.en || "—"}</dd>
              <dt className="text-slate-500">备注说明</dt>
              <dd className="whitespace-pre-wrap leading-6">
                {asset.description.zh || asset.description.en || "—"}
              </dd>
            </dl>
          ) : null}
          {tab === "usage" ? (
            <>
              <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-4 text-sm">
                <dt className="text-slate-500">当前状态</dt>
                <dd>{statusLabels[asset.status]}</dd>
                <dt className="text-slate-500">实验平台</dt>
                <dd>{asset.currentPlatformCode || "—"}</dd>
                <dt className="text-slate-500">存放位置</dt>
                <dd>{asset.storageLocation || "—"}</dd>
                <dt className="text-slate-500">当前关系</dt>
                <dd>{assignment(asset)}</dd>
              </dl>
              <div className="mt-8 border-t border-slate-200 pt-5">
                <h3 className="font-semibold text-slate-900">申请使用设备</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  闲置设备自动批准，其他状态由资产管理员审批。
                </p>
                <textarea
                  className={`${field} mt-3 min-h-24`}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="填写使用目的或预计使用时间"
                  value={reason}
                />
                <button
                  className={`${secondary} mt-3`}
                  disabled={busy || asset.assignedUserId === userId}
                  onClick={async () => {
                    if (await onRequest(asset.code, reason)) setReason("");
                  }}
                  type="button"
                >
                  {asset.status === "idle" ? "申请并立即使用" : "提交使用申请"}
                </button>
              </div>
            </>
          ) : null}
          {tab === "history" ? (
            <div className="border-l-2 border-cyan-600 pl-4">
              <p className="text-sm font-semibold text-slate-900">最近更新</p>
              <p className="mt-1 text-sm text-slate-500">
                {asset.updatedAt
                  ? new Intl.DateTimeFormat("zh-CN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(asset.updatedAt))
                  : "暂无更新时间"}
              </p>
              <p className="mt-4 text-xs leading-5 text-slate-500">
                完整操作记录将在后续审计日志界面中展示。
              </p>
            </div>
          ) : null}
        </div>
        {writable ? (
          <footer className="flex items-center justify-between border-t border-slate-200 px-5 py-4 sm:px-7">
            <button
              className="text-sm font-semibold text-red-700 hover:underline"
              onClick={() => {
                onClose();
                onDelete(asset);
              }}
              type="button"
            >
              删除设备
            </button>
            <div className="flex gap-2">
              <button className={secondary} onClick={onClose} type="button">
                取消
              </button>
              <button
                className={primary}
                onClick={() => onEdit(asset)}
                type="button"
              >
                编辑设备
              </button>
            </div>
          </footer>
        ) : null}
      </div>
    </dialog>
  );
}

export function AssetWorkbench({
  initialAssetCode,
  busy,
  snapshot,
  userId,
  writable,
  onAdd,
  onBatch,
  onDelete,
  onEdit,
  onImport,
  onRequest,
}: Props) {
  const [display, setDisplay] = useState<"list" | "card" | "group">(
    writable ? "list" : "card",
  );
  const [groupBy, setGroupBy] = useState<AssetGroupBy>("deviceType");
  const [filters, setFilters] = useState<AssetFilters>({
    deviceType: "all",
    location: "all",
    platform: "all",
    query: "",
    status: "all",
  });
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<LabAsset | null>(null);
  const [batchAction, setBatchAction] = useState<BatchAction>("set_status");
  const [batchValue, setBatchValue] = useState("maintenance");
  const [importOpen, setImportOpen] = useState(false);
  const [qrOpen,setQrOpen]=useState(false);
  const [inventoryOpen,setInventoryOpen]=useState(false);
  const [exportScope, setExportScope] = useState<
    "all" | "filtered" | "selected"
  >("filtered");
  const filtered = useMemo(
    () => filterAssets(snapshot.assets, filters),
    [filters, snapshot.assets],
  );
  const groups = useMemo(
    () => groupAssets(filtered, groupBy),
    [filtered, groupBy],
  );
  const locations = useMemo(
    () =>
      [
        ...new Set(
          snapshot.assets.flatMap((item) =>
            item.storageLocation ? [item.storageLocation] : [],
          ),
        ),
      ].sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true })),
    [snapshot.assets],
  );
  const allVisibleSelected =
    filtered.length > 0 &&
    filtered.every((item) => selectedCodes.includes(item.code));
  useEffect(()=>{if(!initialAssetCode)return;const asset=snapshot.assets.find((item)=>item.code===initialAssetCode);if(asset)setSelectedAsset(asset);},[initialAssetCode,snapshot.assets]);

  function updateFilter(key: keyof AssetFilters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }
  function openAsset(asset: LabAsset) {
    setSelectedAsset(asset);
  }
  function toggle(code: string) {
    setSelectedCodes((current) =>
      current.includes(code)
        ? current.filter((item) => item !== code)
        : [...current, code],
    );
  }
  function preventRow(event: MouseEvent) {
    event.stopPropagation();
  }
  function batchOptions() {
    if (batchAction === "set_status")
      return (
        <select
          className={field}
          onChange={(event) => setBatchValue(event.target.value)}
          value={batchValue}
        >
          <option value="idle">闲置</option>
          <option value="maintenance">维护中</option>
          <option value="retired">报废</option>
        </select>
      );
    if (batchAction === "set_device_type")
      return (
        <select
          className={field}
          onChange={(event) => setBatchValue(event.target.value)}
          value={batchValue}
        >
          <option value="">选择设备类型</option>
          {snapshot.deviceTypes.map((item) => (
            <option key={item.code} value={item.code}>
              {item.name}
            </option>
          ))}
        </select>
      );
    return (
      <input
        className={field}
        onChange={(event) => setBatchValue(event.target.value)}
        placeholder="留空可清除位置"
        value={batchValue}
      />
    );
  }
  function changeBatchAction(action: BatchAction) {
    setBatchAction(action);
    setBatchValue(action === "set_status" ? "maintenance" : "");
  }
  async function applyBatch() {
    const value =
      batchAction === "set_location"
        ? batchValue.trim() || null
        : batchValue;
    if (!value && batchAction === "set_device_type") return;
    if (await onBatch(batchAction, value, selectedCodes)) setSelectedCodes([]);
  }
  function exportAssets() {
    const assets =
      exportScope === "all"
        ? snapshot.assets
        : exportScope === "selected"
          ? snapshot.assets.filter((asset) =>
              selectedCodes.includes(asset.code),
            )
          : filtered;
    downloadCsv(
      `RNAV_实验室资产_${new Date().toISOString().slice(0, 10)}.csv`,
      exportAssetsCsv(assets),
    );
  }

  return (
    <div className="mt-6">
      <div className="grid gap-3 border-y border-slate-200 bg-white py-4 lg:grid-cols-[minmax(14rem,1fr)_repeat(4,minmax(8rem,0.55fr))]">
        <label className="text-xs font-semibold text-slate-600">
          搜索
          <input
            className={`${field} mt-1`}
            onChange={(event) => updateFilter("query", event.target.value)}
            placeholder="名称、编号、型号、序列号或位置"
            value={filters.query}
          />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          设备类型
          <select
            className={`${field} mt-1`}
            onChange={(event) => updateFilter("deviceType", event.target.value)}
            value={filters.deviceType}
          >
            <option value="all">全部类型</option>
            {snapshot.deviceTypes.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          状态
          <select
            className={`${field} mt-1`}
            onChange={(event) => updateFilter("status", event.target.value)}
            value={filters.status}
          >
            <option value="all">全部状态</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          实验平台
          <select
            className={`${field} mt-1`}
            onChange={(event) => updateFilter("platform", event.target.value)}
            value={filters.platform}
          >
            <option value="all">全部平台</option>
            <option value="unassigned">未装载</option>
            {snapshot.platforms.map((item) => (
              <option key={item.code} value={item.code}>
                {item.code}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          存放位置
          <select
            className={`${field} mt-1`}
            onChange={(event) => updateFilter("location", event.target.value)}
            value={filters.location}
          >
            <option value="all">全部位置</option>
            <option value="unassigned">未填写</option>
            {locations.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            className="text-sm font-semibold text-cyan-800 hover:underline"
            onClick={() =>
              setFilters({
                deviceType: "all",
                location: "all",
                platform: "all",
                query: "",
                status: "all",
              })
            }
            type="button"
          >
            清除筛选
          </button>
          <span className="text-xs text-slate-500">
            {filtered.length} / {snapshot.assets.length} 台
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex border border-slate-300 bg-white p-1">
            {(["list", "card", "group"] as const).map((item) => (
              <button
                className={`px-3 py-1.5 text-sm font-semibold ${display === item ? "bg-blue-950 text-white" : "text-slate-600 hover:text-cyan-800"}`}
                key={item}
                onClick={() => setDisplay(item)}
                type="button"
              >
                {{ list: "列表", card: "卡片", group: "分组" }[item]}
              </button>
            ))}
          </div>
          {writable ? (
            <>
              <button className={secondary} onClick={()=>setInventoryOpen(true)} type="button">盘点</button>
              <button className={secondary} disabled={!selectedCodes.length} onClick={()=>setQrOpen(true)} type="button">打印二维码</button>
              <button
                className={secondary}
                onClick={() => setImportOpen(true)}
                type="button"
              >
                批量导入
              </button>
              <div className="flex">
                <label className="sr-only" htmlFor="asset-export-scope">
                  导出范围
                </label>
                <select
                  className="border border-r-0 border-slate-300 bg-white px-2 text-sm"
                  id="asset-export-scope"
                  onChange={(event) =>
                    setExportScope(event.target.value as typeof exportScope)
                  }
                  value={exportScope}
                >
                  <option value="filtered">筛选结果</option>
                  <option value="all">全部设备</option>
                  <option disabled={!selectedCodes.length} value="selected">
                    已选设备
                  </option>
                </select>
                <button
                  className={secondary}
                  disabled={exportScope === "selected" && !selectedCodes.length}
                  onClick={exportAssets}
                  type="button"
                >
                  导出
                </button>
              </div>
              <button
                className={primary}
                disabled={!snapshot.deviceTypes.length}
                onClick={onAdd}
                type="button"
              >
                + 新增设备
              </button>
            </>
          ) : null}
        </div>
      </div>

      {display === "group" ? (
        <div className="mt-4 flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-500">分组方式</span>
          <select
            className="border border-slate-300 bg-white px-3 py-2 text-sm"
            onChange={(event) => setGroupBy(event.target.value as AssetGroupBy)}
            value={groupBy}
          >
            <option value="deviceType">设备类型</option>
            <option value="platform">实验平台</option>
            <option value="location">存放位置</option>
            <option value="status">状态</option>
          </select>
        </div>
      ) : null}

      {!filtered.length ? (
        <div className="mt-6">
          <ConsoleEmptyState
            action={
              writable ? (
                <button className={primary} onClick={onAdd} type="button">
                  添加第一台设备
                </button>
              ) : undefined
            }
            description="调整筛选条件，或添加新的实验室设备。"
            title="没有符合条件的设备"
          />
        </div>
      ) : null}

      {display === "list" && filtered.length ? (
        <div className="mt-5 overflow-x-auto border-y border-slate-200 bg-white">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="w-12 px-4 py-3">
                  <input
                    aria-label="选择当前结果"
                    checked={allVisibleSelected}
                    onChange={() =>
                      setSelectedCodes(
                        allVisibleSelected
                          ? selectedCodes.filter(
                              (code) =>
                                !filtered.some((asset) => asset.code === code),
                            )
                          : [
                              ...new Set([
                                ...selectedCodes,
                                ...filtered.map((item) => item.code),
                              ]),
                            ],
                      )
                    }
                    type="checkbox"
                  />
                </th>
                <th className="px-3 py-3">设备名称</th>
                <th className="px-3 py-3">资产编号</th>
                <th className="px-3 py-3">型号</th>
                <th className="px-3 py-3">设备类型</th>
                <th className="px-3 py-3">状态</th>
                <th className="px-3 py-3">平台 / 位置</th>
                <th className="px-3 py-3">当前使用</th>
                <th className="px-3 py-3">最近更新</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((asset) => (
                <tr
                  className="cursor-pointer border-t border-slate-100 transition-colors hover:bg-cyan-50/60"
                  key={asset.code}
                  onClick={() => openAsset(asset)}
                >
                  <td className="px-4 py-3" onClick={preventRow}>
                    <input
                      aria-label={`选择 ${asset.code}`}
                      checked={selectedCodes.includes(asset.code)}
                      onChange={() => toggle(asset.code)}
                      type="checkbox"
                    />
                  </td>
                  <td className="px-3 py-3 font-semibold text-slate-900">
                    <button
                      className="text-left hover:text-cyan-800 hover:underline"
                      onClick={() => openAsset(asset)}
                      type="button"
                    >
                      {asset.name.zh || asset.name.en || "未命名设备"}
                    </button>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-cyan-800">
                    {asset.code}
                  </td>
                  <td className="px-3 py-3">{asset.model || "—"}</td>
                  <td className="px-3 py-3">{asset.deviceTypeName}</td>
                  <td className="px-3 py-3">
                    <AssetStatus asset={asset} />
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <span className="block">
                      {asset.currentPlatformCode || "未装载"}
                    </span>
                    <span className="mt-1 block text-slate-500">
                      {asset.storageLocation || "未填写位置"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs">{assignment(asset)}</td>
                  <td className="px-3 py-3 text-xs text-slate-500">
                    {asset.updatedAt
                      ? new Intl.DateTimeFormat("zh-CN", {
                          month: "numeric",
                          day: "numeric",
                        }).format(new Date(asset.updatedAt))
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {display === "card" && filtered.length ? (
        <div className="mt-5 grid gap-px bg-slate-200 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((asset) => (
            <article
              className="group relative bg-white p-5 transition-colors hover:bg-cyan-50"
              key={asset.code}
            >
              {writable ? (
                <input
                  aria-label={`选择 ${asset.code}`}
                  checked={selectedCodes.includes(asset.code)}
                  className="absolute right-4 top-4"
                  onChange={() => toggle(asset.code)}
                  type="checkbox"
                />
              ) : null}
              <button
                className="w-full pr-8 text-left"
                onClick={() => openAsset(asset)}
                type="button"
              >
                <p className="font-mono text-xs font-semibold text-cyan-700">
                  {asset.code}
                </p>
                <h3 className="mt-2 text-lg font-semibold text-slate-950">
                  {asset.name.zh || asset.name.en || "未命名设备"}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {asset.deviceTypeName} · {asset.model || "无型号"}
                </p>
                <div className="mt-5 flex items-center justify-between gap-3">
                  <AssetStatus asset={asset} />
                  <span className="truncate text-xs text-slate-500">
                    {asset.storageLocation ||
                      asset.currentPlatformCode ||
                      "未填写位置"}
                  </span>
                </div>
              </button>
            </article>
          ))}
        </div>
      ) : null}

      {display === "group" && filtered.length ? (
        <div className="mt-5 space-y-6">
          {groups.map((group) => (
            <section key={group.name}>
              <div className="flex items-end justify-between border-b border-slate-300 pb-2">
                <h3 className="font-semibold text-slate-900">{group.name}</h3>
                <span className="text-xs text-slate-500">
                  {group.items.length} 台
                </span>
              </div>
              <div className="grid gap-px bg-slate-200 md:grid-cols-2 xl:grid-cols-3">
                {group.items.map((asset) => (
                  <button
                    className="bg-white p-4 text-left transition-colors hover:bg-cyan-50"
                    key={asset.code}
                    onClick={() => openAsset(asset)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-mono text-xs font-semibold text-cyan-700">
                        {asset.code}
                      </span>
                      <AssetStatus asset={asset} />
                    </div>
                    <p className="mt-2 font-semibold text-slate-900">
                      {asset.name.zh || asset.name.en}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {asset.model || "无型号"} · {assignment(asset)}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {writable && selectedCodes.length ? (
        <div className="sticky bottom-4 z-20 mt-6 flex flex-col gap-3 border border-cyan-200 bg-slate-950 p-4 text-white shadow-[0_16px_40px_rgba(15,23,42,0.28)] lg:flex-row lg:items-center">
          <div className="shrink-0">
            <strong className="font-mono text-xl tabular-nums">
              {selectedCodes.length}
            </strong>
            <span className="ml-2 text-sm text-slate-300">台设备已选择</span>
          </div>
          <div className="grid flex-1 gap-2 sm:grid-cols-[12rem_minmax(12rem,1fr)_auto]">
            <select
              className="border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
              onChange={(event) =>
                changeBatchAction(event.target.value as BatchAction)
              }
              value={batchAction}
            >
              <option value="set_status">修改设备状况</option>
              <option value="set_device_type">修改设备类型</option>
              <option value="set_location">修改存放位置</option>
            </select>
            {batchOptions()}
            <button
              className="bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:bg-slate-600"
              disabled={
                busy || (batchAction === "set_device_type" && !batchValue)
              }
              onClick={() => void applyBatch()}
              type="button"
            >
              应用
            </button>
          </div>
          <button
            className="text-sm text-slate-300 hover:text-white"
            onClick={() => setSelectedCodes([])}
            type="button"
          >
            取消选择
          </button>
        </div>
      ) : null}

      <AssetDrawer
        asset={selectedAsset}
        busy={busy}
        onClose={() => setSelectedAsset(null)}
        onDelete={onDelete}
        onEdit={(asset) => {
          setSelectedAsset(null);
          onEdit(asset);
        }}
        onRequest={onRequest}
        userId={userId}
        writable={writable}
      />
      <AssetImportDialog
        onClose={() => setImportOpen(false)}
        onCommit={onImport}
        open={importOpen}
        revision={snapshot.revision}
      />
      <AssetQrLabels assets={snapshot.assets.filter((asset)=>selectedCodes.includes(asset.code))} onClose={()=>setQrOpen(false)} open={qrOpen}/>
      <InventoryDialog assets={snapshot.assets} onClose={()=>setInventoryOpen(false)} open={inventoryOpen}/>
    </div>
  );
}
