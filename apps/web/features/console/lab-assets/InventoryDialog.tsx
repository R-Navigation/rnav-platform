"use client";

import { useEffect, useState } from "react";
import { consoleApi } from "@/lib/consoleApi";
import { ConsoleAlert, ConsoleButton, ConsoleDrawer, ConsoleEmptyState, ConsoleInput } from "@/features/console/ui";
import type { LabAsset } from "./model";

type Batch = { id: string; name: string; status: string; expectedCount: number; scannedCount: number; createdAt: string };
type Detail = { id: string; name: string; status: string; scannedCount: number; missingCount: number; items: Array<{ code: string; name: string; scannedAt: string | null }> };

export function InventoryDialog({ assets, open, onClose }: { assets: LabAsset[]; open: boolean; onClose: () => void }) {
  const [batches, setBatches] = useState<Batch[]>([]); const [detail, setDetail] = useState<Detail | null>(null); const [name, setName] = useState(""); const [scan, setScan] = useState(""); const [error, setError] = useState("");
  async function load() { const result = await consoleApi<{ batches: Batch[] }>("/api/lab-assets/inventory"); setBatches(result.batches); }
  async function openBatch(id: string) { setDetail(await consoleApi<Detail>(`/api/lab-assets/inventory/${id}`)); }
  useEffect(() => { if (open) void load().catch((problem) => setError(problem instanceof Error ? problem.message : "盘点加载失败")); }, [open]);
  async function act(action: () => Promise<void>) { try { setError(""); await action(); } catch (problem) { setError(problem instanceof Error ? problem.message : "操作失败"); } }
  const activeCount = assets.filter((asset) => asset.status !== "retired").length;
  return <ConsoleDrawer onClose={onClose} open={open} title="资产盘点">
    {error ? <ConsoleAlert tone="danger">{error}</ConsoleAlert> : null}
    {detail ? <div className={error ? "mt-5" : ""}>
      <button className="text-sm font-semibold text-cyan-800 hover:underline" onClick={() => setDetail(null)}>← 返回盘点批次</button>
      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-5"><p className="text-xs font-semibold text-slate-500">盘点进度</p><div className="mt-2 flex items-end gap-2"><strong className="font-mono text-4xl text-slate-950">{detail.scannedCount}</strong><span className="pb-1 text-lg text-slate-400">/ {detail.scannedCount + detail.missingCount}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><span className="block h-full rounded-full bg-cyan-600" style={{ width: `${Math.round(detail.scannedCount / Math.max(1, detail.scannedCount + detail.missingCount) * 100)}%` }}/></div><p className="mt-2 text-xs text-slate-500">{detail.name} · 仍有 {detail.missingCount} 台待盘</p></div>
      {detail.status === "open" ? <div className="mt-4 space-y-3"><ConsoleInput autoFocus className="min-h-12 text-base" onChange={(event) => setScan(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && scan) void act(async () => { await consoleApi(`/api/lab-assets/inventory/${detail.id}/scan`, { method: "POST", body: JSON.stringify({ assetCode: scan }) }); setScan(""); await openBatch(detail.id); }); }} placeholder="扫码或输入资产编号" value={scan}/><ConsoleButton className="min-h-11 w-full" onClick={() => void act(async () => { await consoleApi(`/api/lab-assets/inventory/${detail.id}/complete`, { method: "POST" }); await openBatch(detail.id); await load(); })} variant="primary">完成本次盘点</ConsoleButton></div> : null}
      <h3 className="mt-6 text-sm font-semibold text-slate-900">最近扫描与待盘设备</h3><div className="mt-3 space-y-2">{detail.items.map((item) => <div className={`flex items-center justify-between rounded-lg border p-3 text-sm ${item.scannedAt ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`} key={item.code}><span><b className="font-mono text-xs">{item.code}</b><span className="ml-2">{item.name}</span></span><span className="text-xs font-semibold">{item.scannedAt ? "已盘" : "待盘"}</span></div>)}</div>
    </div> : <div className={error ? "mt-5" : ""}>
      <form className="rounded-xl border border-slate-200 bg-slate-50 p-4" onSubmit={(event) => { event.preventDefault(); void act(async () => { const created = await consoleApi<{ id: string }>("/api/lab-assets/inventory", { method: "POST", body: JSON.stringify({ name, assetCodes: [] }) }); setName(""); await load(); await openBatch(created.id); }); }}><label className="text-sm font-semibold text-slate-700">新盘点名称<ConsoleInput className="mt-2" placeholder={`默认包含 ${activeCount} 台在役设备`} required value={name} onChange={(event) => setName(event.target.value)}/></label><ConsoleButton className="mt-3 min-h-11 w-full" variant="primary">创建全量盘点</ConsoleButton></form>
      <h3 className="mt-6 text-sm font-semibold text-slate-900">历史批次</h3>{batches.length ? <div className="mt-3 space-y-2">{batches.map((batch) => <button className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white p-4 text-left hover:border-cyan-300 hover:bg-cyan-50" key={batch.id} onClick={() => void openBatch(batch.id)}><span><b className="block text-sm">{batch.name}</b><small className="mt-1 block text-slate-500">{new Date(batch.createdAt).toLocaleDateString("zh-CN")}</small></span><span className="text-sm font-semibold tabular-nums">{batch.scannedCount}/{batch.expectedCount}<span className="mt-1 block text-right text-[10px] text-slate-400">{batch.status === "open" ? "进行中" : "已完成"}</span></span></button>)}</div> : <div className="mt-3"><ConsoleEmptyState description="创建盘点后，可用手机扫码或输入资产编号。" title="还没有盘点批次"/></div>}
    </div>}
  </ConsoleDrawer>;
}
