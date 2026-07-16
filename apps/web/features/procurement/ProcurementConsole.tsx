"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addProcurementComment,
  completeProcurementProcessing,
  confirmProcurementReceived,
  createProcurement,
  loadProcurement,
  loadProcurements,
  saveProcurementProcessing,
  transitionProcurement,
} from "./api";
import {
  availableActions,
  displayAttributes,
  groupProcurementItems,
  procurementCapabilities,
  type ProcurementCatalogSnapshot,
  type ProcurementStatus,
} from "./model";
import { ProcurementCatalogManager } from "./ProcurementCatalogManager";
import { ProcurementOrderBuilder } from "./ProcurementOrderBuilder";

type Props = { permissions: string[]; userId: string };
type RequestSummary = {
  id: string;
  requestNo: string;
  requesterId: string;
  requesterName: string;
  title: string;
  reason: string;
  status: ProcurementStatus;
  totalEstimatedAmount: number;
  createdAt: string;
  updatedAt: string;
};
type ProcessingStatus = "pending" | "purchased" | "rejected";
type ProcurementItem = {
  id: string;
  item_name: string;
  spec: string;
  unit?: string;
  quantity: number;
  estimated_unit_price: number | null;
  source_type?: "catalog" | "custom";
  url?: string | null;
  catalog_snapshot?: ProcurementCatalogSnapshot;
  processing_status?: ProcessingStatus;
  rejection_reason?: string | null;
};
type ProcurementDetail = {
  id: string;
  request_no?: string;
  requestNo?: string;
  requester_id?: string;
  requesterId?: string;
  requester_name?: string;
  title: string;
  reason: string;
  status: ProcurementStatus;
  items?: ProcurementItem[];
};

const field =
  "mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 focus:border-cyan-700 focus:outline-none";
const primary = "bg-blue-950 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-400";
const secondary =
  "border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-cyan-700";
const statusLabels: Record<ProcurementStatus, string> = {
  draft: "草稿",
  submitted: "待处理",
  approved: "已批准",
  rejected: "已驳回",
  purchasing: "处理中",
  purchased: "已下单",
  received: "已到货",
  closed: "已完成",
  cancelled: "已撤回",
};
const statusStyles: Record<ProcurementStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitted: "bg-amber-100 text-amber-800",
  approved: "bg-cyan-100 text-cyan-800",
  rejected: "bg-red-100 text-red-800",
  purchasing: "bg-blue-100 text-blue-800",
  purchased: "bg-emerald-100 text-emerald-800",
  received: "bg-emerald-100 text-emerald-800",
  closed: "bg-slate-200 text-slate-700",
  cancelled: "bg-slate-200 text-slate-600",
};

function linkFor(item: ProcurementItem) {
  return item.url || item.catalog_snapshot?.url || null;
}

function itemTags(item: ProcurementItem) {
  return displayAttributes(item.catalog_snapshot?.specMetadata ?? {});
}

function ItemTags({ item }: { item: ProcurementItem }) {
  const tags = itemTags(item);
  if (!tags.length) return <span className="text-xs text-slate-500">{item.spec || "未填写规格"}</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          className="border border-cyan-200 bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-950"
          key={tag.key}
        >
          <span className="text-cyan-700">{tag.label}</span> {tag.value}{tag.unit}
        </span>
      ))}
    </div>
  );
}

function GroupedItems({ items }: { items: ProcurementItem[] }) {
  const groups = groupProcurementItems(items);
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section className="border border-slate-200" key={group.category}>
          <h3 className="border-b border-slate-200 bg-blue-950 px-4 py-2.5 text-sm font-bold text-white">
            {group.category}
          </h3>
          {group.subcategories.map((subcategory) => (
            <div className="border-b border-slate-200 last:border-b-0" key={subcategory.subcategory}>
              <div className="flex items-center justify-between bg-slate-50 px-4 py-2">
                <h4 className="text-sm font-bold text-slate-800">{subcategory.subcategory}</h4>
                <span className="text-xs text-slate-500">{subcategory.items.length} 项</span>
              </div>
              <div className="divide-y divide-slate-200">
                {subcategory.items.map((item) => {
                  const url = linkFor(item);
                  return (
                    <article className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_140px]" key={item.id}>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong>{item.item_name}</strong>
                          <span className="text-xs text-slate-400">{item.source_type === "catalog" ? "目录" : "自定义"}</span>
                        </div>
                        <div className="mt-2"><ItemTags item={item} /></div>
                        {url ? (
                          <a className="mt-2 inline-block text-xs font-semibold text-cyan-800 underline" href={url} rel="noreferrer" target="_blank">
                            前往购物平台购买 ↗
                          </a>
                        ) : null}
                        {item.processing_status && item.processing_status !== "pending" ? (
                          <p className={`mt-2 text-xs font-semibold ${item.processing_status === "purchased" ? "text-emerald-700" : "text-red-700"}`}>
                            {item.processing_status === "purchased" ? "已购买" : `已驳回：${item.rejection_reason || ""}`}
                          </p>
                        ) : null}
                      </div>
                      <div className="md:text-right">
                        <p className="text-xs font-semibold text-slate-500">采购数量</p>
                        <p className="mt-1 text-2xl font-black text-blue-950">{item.quantity}<span className="ml-1 text-sm">{item.unit || "件"}</span></p>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function ProcessingPanel({
  request,
  busy,
  onRun,
}: {
  request: ProcurementDetail;
  busy: boolean;
  onRun(action: () => Promise<unknown>, success: string): Promise<boolean>;
}) {
  const [draft, setDraft] = useState(
    () => Object.fromEntries((request.items ?? []).map((item) => [item.id, { status: item.processing_status ?? "pending", rejectionReason: item.rejection_reason ?? "" }])) as Record<string, { status: ProcessingStatus; rejectionReason: string }>,
  );
  useEffect(() => {
    setDraft(Object.fromEntries((request.items ?? []).map((item) => [item.id, { status: item.processing_status ?? "pending", rejectionReason: item.rejection_reason ?? "" }])))
  }, [request]);

  const items = request.items ?? [];
  const groups = groupProcurementItems(items);
  const completedCount = items.filter((item) => draft[item.id]?.status !== "pending").length;
  const allDone = items.length > 0 && completedCount === items.length;
  const setStatus = (id: string, status: ProcessingStatus) => setDraft((current) => ({
    ...current,
    [id]: { status, rejectionReason: status === "rejected" ? current[id]?.rejectionReason ?? "" : "" },
  }));
  const processingBody = () => ({
    items: items.map((item) => ({
      itemId: item.id,
      status: draft[item.id]?.status ?? "pending",
      rejectionReason: draft[item.id]?.status === "rejected" ? draft[item.id]?.rejectionReason || null : null,
    })),
  });
  const save = () => onRun(() => saveProcurementProcessing(request.id, processingBody()), "采购处理进度已保存。");
  const complete = () => onRun(async () => {
    await saveProcurementProcessing(request.id, processingBody());
    await completeProcurementProcessing(request.id);
  }, "采购申请处理完成。");

  return (
    <section className="mt-6 border-t border-slate-200 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-blue-950">逐条采购处理</h3>
          <p className="mt-1 text-xs text-slate-500">清单已按一级分类和二级分类归组。</p>
        </div>
        <div className="min-w-40">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600"><span>处理进度</span><span>{completedCount} / {items.length}</span></div>
          <div className="mt-1 h-2 overflow-hidden bg-slate-200"><div className="h-full bg-cyan-700" style={{ width: `${items.length ? completedCount / items.length * 100 : 0}%` }} /></div>
        </div>
      </div>

      <div className="mt-4 space-y-6">
        {groups.map((group) => (
          <section className="border border-slate-200" key={group.category}>
            <div className="flex items-center justify-between border-b border-slate-200 bg-blue-950 px-4 py-3 text-white">
              <h4 className="font-bold">{group.category}</h4>
              <span className="text-xs text-blue-100">{group.subcategories.reduce((sum, item) => sum + item.items.length, 0)} 项</span>
            </div>
            {group.subcategories.map((subcategory) => (
              <div className="border-b border-slate-200 last:border-b-0" key={subcategory.subcategory}>
                <div className="flex items-center justify-between bg-slate-50 px-4 py-2.5">
                  <h5 className="text-sm font-bold text-slate-800">{subcategory.subcategory}</h5>
                  <span className="text-xs text-slate-500">{subcategory.items.length} 项</span>
                </div>
                <div className="divide-y divide-slate-200">
                  {subcategory.items.map((item) => {
                    const state = draft[item.id] ?? { status: "pending" as const, rejectionReason: "" };
                    const url = linkFor(item);
                    return (
                      <article className={`p-4 ${state.status === "purchased" ? "bg-emerald-50" : state.status === "rejected" ? "bg-red-50" : "bg-white"}`} key={item.id}>
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_130px_104px] lg:items-start">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <strong className="text-slate-950">{item.item_name}</strong>
                              <span className="text-xs text-slate-400">{item.source_type === "catalog" ? "目录" : "自定义"}</span>
                            </div>
                            <div className="mt-2"><ItemTags item={item} /></div>
                            {item.spec && itemTags(item).length ? <p className="mt-2 text-xs text-slate-500">规格摘要：{item.spec}</p> : null}
                            {url ? (
                              <a className="mt-3 inline-block text-sm font-bold text-cyan-800 underline" href={url} rel="noreferrer" target="_blank">前往购物平台购买 ↗</a>
                            ) : <p className="mt-3 text-xs font-semibold text-amber-700">该条目没有购买链接</p>}
                          </div>
                          <div className="border-l-4 border-cyan-700 pl-3 lg:text-right">
                            <p className="text-xs font-semibold text-slate-500">采购数量</p>
                            <p className="mt-1 text-3xl font-black text-blue-950">{item.quantity}<span className="ml-1 text-base">{item.unit || "件"}</span></p>
                          </div>
                          <div className="flex gap-2 lg:justify-end">
                            <button aria-label="标记已购买" className={`grid h-12 w-12 place-items-center border text-2xl font-bold ${state.status === "purchased" ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-300 bg-white text-emerald-700"}`} onClick={() => setStatus(item.id, state.status === "purchased" ? "pending" : "purchased")} title="已购买/取消" type="button">✓</button>
                            <button aria-label="标记驳回" className={`grid h-12 w-12 place-items-center border text-2xl font-bold ${state.status === "rejected" ? "border-red-700 bg-red-700 text-white" : "border-slate-300 bg-white text-red-700"}`} onClick={() => setStatus(item.id, state.status === "rejected" ? "pending" : "rejected")} title="驳回/取消" type="button">×</button>
                          </div>
                        </div>
                        {state.status === "rejected" ? (
                          <label className="mt-4 block text-xs font-semibold text-red-800">
                            驳回意见
                            <textarea className={`${field} min-h-16 border-red-300`} maxLength={2000} onChange={(event) => setDraft((current) => ({ ...current, [item.id]: { ...current[item.id], rejectionReason: event.target.value } }))} placeholder="说明不同意购买或无法购买的原因" required value={state.rejectionReason} />
                          </label>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>

      <div className="sticky bottom-0 mt-5 flex flex-wrap items-center gap-3 border-t border-slate-300 bg-white py-4">
        <button className={secondary} disabled={busy} onClick={() => void save()} type="button">保存当前进度</button>
        <button className={primary} disabled={busy || !allDone || items.some((item) => draft[item.id]?.status === "rejected" && !draft[item.id]?.rejectionReason.trim())} onClick={() => void complete()} type="button">完成处理</button>
        {!allDone ? <p className="text-xs text-slate-500">所有条目都标记为已购买或已驳回后，才能完成处理。</p> : null}
      </div>
    </section>
  );
}

function RequestList({ requests, selectedId, loading, onSelect }: { requests: RequestSummary[]; selectedId?: string; loading: boolean; onSelect(id: string): void }) {
  return (
    <aside className="border border-slate-200 bg-white xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-center justify-between"><h2 className="font-bold text-blue-950">采购请求</h2><span className="text-xs text-slate-500">{requests.length} 条</span></div>
      </div>
      <div className="divide-y divide-slate-200">
        {requests.map((request) => {
          const selected = selectedId === request.id;
          return (
            <button className={`w-full border-l-4 px-4 py-4 text-left transition-colors ${selected ? "border-cyan-700 bg-cyan-50" : "border-transparent hover:bg-slate-50"}`} key={request.id} onClick={() => onSelect(request.id)} type="button">
              <div className="flex items-start justify-between gap-2">
                <strong className="line-clamp-2 text-sm text-slate-950">{request.title}</strong>
                <span className={`shrink-0 px-2 py-1 text-[11px] font-bold ${statusStyles[request.status]}`}>{statusLabels[request.status]}</span>
              </div>
              <p className="mt-1 font-mono text-[11px] text-slate-500">{request.requestNo}</p>
              <div className="mt-3 flex items-end justify-between gap-2 text-xs text-slate-500">
                <span className="truncate">{request.requesterName}</span>
                <strong className="shrink-0 text-sm text-blue-950">¥{request.totalEstimatedAmount.toFixed(2)}</strong>
              </div>
            </button>
          );
        })}
      </div>
      {loading ? <p className="p-5 text-sm text-slate-500">正在加载...</p> : !requests.length ? <p className="p-5 text-sm text-slate-500">暂无采购申请。</p> : null}
    </aside>
  );
}

export function ProcurementConsole({ permissions, userId }: Props) {
  const capability = procurementCapabilities(permissions);
  const [scope, setScope] = useState<"mine" | "all">(capability.readAll ? "all" : "mine");
  const [requests, setRequests] = useState<RequestSummary[]>([]);
  const [selected, setSelected] = useState<ProcurementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"requests" | "catalog">("requests");
  const [comment, setComment] = useState("");
  const [note, setNote] = useState("");

  const refresh = useCallback(async (nextScope = scope) => {
    setLoading(true);
    try {
      setRequests(await loadProcurements(nextScope) as RequestSummary[]);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法加载采购申请。");
    } finally {
      setLoading(false);
    }
  }, [scope]);
  useEffect(() => { void refresh() }, [refresh]);

  async function openRequest(id: string) {
    setSelectedLoading(true);
    try {
      setSelected(await loadProcurement(id) as ProcurementDetail);
      setNote("");
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法加载申请详情。");
    } finally {
      setSelectedLoading(false);
    }
  }
  async function reloadSelected(messageText: string) {
    await refresh();
    if (selected?.id) setSelected(await loadProcurement(selected.id) as ProcurementDetail);
    setMessage(messageText);
  }
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      await reloadSelected(success);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败。");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function submit(body: unknown) {
    const succeeded = await run(() => createProcurement(body), "采购申请已提交。");
    if (succeeded) setShowForm(false);
    return succeeded;
  }

  const actions = useMemo(() => selected ? availableActions(
    selected.status,
    capability,
    selected.requester_id === userId || selected.requesterId === userId,
  ).filter((action) => action.action === "cancel" || !capability.purchase || !["submitted", "purchasing", "purchased"].includes(selected.status)) : [], [capability, selected, userId]);

  return (
    <section aria-labelledby="procurement-heading">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-slate-300 pb-5">
        <div>
          <p className="text-sm font-semibold text-cyan-800">内部业务</p>
          <h1 className="mt-2 font-serif text-3xl font-bold text-slate-950" id="procurement-heading">零件采购</h1>
          <p className="mt-2 text-sm text-slate-600">成员提交清单，采购管理员逐条处理并跟踪收货</p>
        </div>
        {capability.create ? <button className={primary} onClick={() => setShowForm(true)} type="button">新建申请</button> : null}
      </header>
      <nav aria-label="采购模块视图" className="mt-5 flex gap-1 border-b border-slate-300">
        <button className={`border-b-2 px-3 py-2.5 text-sm font-semibold ${view === "requests" ? "border-cyan-700 text-cyan-800" : "border-transparent text-slate-600"}`} onClick={() => setView("requests")} type="button">采购申请</button>
        {capability.purchase ? <button className={`border-b-2 px-3 py-2.5 text-sm font-semibold ${view === "catalog" ? "border-cyan-700 text-cyan-800" : "border-transparent text-slate-600"}`} onClick={() => setView("catalog")} type="button">标准件目录</button> : null}
      </nav>
      {message ? <p className="mt-4 border border-cyan-200 bg-white px-4 py-3 text-sm text-slate-700" role="status">{message}</p> : null}

      {view === "catalog" && capability.purchase ? <ProcurementCatalogManager /> : (
        <>
          {showForm ? <ProcurementOrderBuilder busy={busy} onCancel={() => setShowForm(false)} onSubmit={submit} /> : null}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex border border-slate-300 bg-white p-1">
              <button className={`px-3 py-2 text-sm font-semibold ${scope === "mine" ? "bg-blue-950 text-white" : "text-slate-600"}`} onClick={() => { setScope("mine"); setSelected(null) }} type="button">我的申请</button>
              {capability.readAll ? <button className={`px-3 py-2 text-sm font-semibold ${scope === "all" ? "bg-blue-950 text-white" : "text-slate-600"}`} onClick={() => { setScope("all"); setSelected(null) }} type="button">全部申请</button> : null}
            </div>
            <button className={secondary} onClick={() => void refresh()} type="button">刷新</button>
          </div>

          <div className="mt-6 grid items-start gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
            <RequestList loading={loading} onSelect={(id) => void openRequest(id)} requests={requests} selectedId={selected?.id} />
            {selectedLoading ? (
              <main className="grid min-h-96 place-items-center border border-slate-200 bg-white p-8 text-sm text-slate-500">正在加载采购请求...</main>
            ) : selected ? (
              <main className="min-w-0 border border-slate-200 bg-white p-5 lg:p-7">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-slate-500">{selected.request_no || selected.requestNo}</p>
                    <h2 className="mt-2 text-2xl font-bold text-slate-950">{selected.title}</h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{selected.reason}</p>
                  </div>
                  <span className={`px-3 py-2 text-sm font-bold ${statusStyles[selected.status]}`}>{statusLabels[selected.status]}</span>
                </div>

                {capability.purchase && ["submitted", "purchasing"].includes(selected.status) ? (
                  <ProcessingPanel busy={busy} onRun={run} request={selected} />
                ) : (
                  <section className="mt-6">
                    <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold text-blue-950">采购清单</h3><span className="text-xs text-slate-500">{selected.items?.length ?? 0} 项</span></div>
                    <GroupedItems items={selected.items ?? []} />
                  </section>
                )}

                {capability.purchase && selected.status === "purchased" ? (
                  <div className="mt-5 border-t border-slate-200 pt-4"><button className={primary} disabled={busy} onClick={() => void run(() => confirmProcurementReceived(selected.id), "已确认全部收货，采购申请完成。")} type="button">确认全部收货并完成</button></div>
                ) : null}
                {actions.length ? (
                  <div className="mt-5 border-t border-slate-200 pt-4">
                    <label className="text-sm font-semibold">处理备注<textarea className={`${field} min-h-20`} value={note} onChange={(event) => setNote(event.target.value)} /></label>
                    <div className="mt-3 flex flex-wrap gap-2">{actions.map((action) => <button className={action.action === "reject" || action.action === "cancel" ? "border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700" : primary} disabled={busy} key={action.action} onClick={() => void run(() => transitionProcurement(selected.id, action.action, note), `${action.label}成功。`).then((succeeded) => { if (succeeded) setNote("") })} type="button">{action.label}</button>)}</div>
                  </div>
                ) : null}
                <form className="mt-5 border-t border-slate-200 pt-4" onSubmit={(event) => { event.preventDefault(); if (!comment.trim()) return; void run(() => addProcurementComment(selected.id, comment), "评论已添加。").then((succeeded) => { if (succeeded) setComment("") }) }}>
                  <label className="text-sm font-semibold">添加评论<textarea className={`${field} min-h-20`} value={comment} onChange={(event) => setComment(event.target.value)} /></label>
                  <button className={`${secondary} mt-2`} disabled={busy} type="submit">发送评论</button>
                </form>
              </main>
            ) : (
              <main className="grid min-h-96 place-items-center border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <div><p className="text-lg font-bold text-slate-700">请选择一个采购请求开始处理</p><p className="mt-2 text-sm text-slate-500">从左侧列表选择请求后，采购清单和逐条处理操作将在这里显示。</p></div>
              </main>
            )}
          </div>
        </>
      )}
    </section>
  );
}
