"use client";

import { useEffect, useMemo, useState } from "react";
import {
  commitLabAssetImport,
  validateLabAssetImport,
} from "@/features/console/lab-assets/api";

type Item = {
  id: string;
  item_name: string;
  spec: string;
  quantity: number;
  processing_status?: "pending" | "purchased" | "rejected";
};
type Request = {
  id: string;
  request_no?: string;
  requestNo?: string;
  items?: Item[];
};
type Draft = {
  sourceItemId: string;
  code: string;
  nameZh: string;
  nameEn: string;
  model: string;
  deviceTypeCode: string;
  vendorSerial: string;
  storageLocation: string;
  status: "idle";
  platformCode: string;
  descriptionZh: string;
  procurementRequestId: string;
};
type Snapshot = {
  revision: string;
  deviceTypes: Array<{ code: string; name: string }>;
};

const field =
  "w-full border border-slate-300 bg-white px-2 py-2 text-xs outline-none focus:border-cyan-700";
const safeCode = (value: string) =>
  value
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 160) || "ASSET";

export function ProcurementAssetDraftDialog({
  request,
  onClose,
  onImported,
}: {
  request: Request;
  onClose(): void;
  onImported(count: number): void;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const eligible = useMemo(
    () =>
      (request.items ?? []).filter(
        (item) =>
          item.processing_status !== "rejected" &&
          Number.isInteger(Number(item.quantity)) &&
          Number(item.quantity) > 0 &&
          Number(item.quantity) <= 100,
      ),
    [request.items],
  );
  useEffect(() => {
    void fetch("/api/lab-assets", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("无法加载资产类型。");
        return response.json();
      })
      .then((value) => setSnapshot(value as Snapshot))
      .catch((value) =>
        setError(value instanceof Error ? value.message : "无法加载资产资料。"),
      );
  }, []);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [busy, onClose]);

  function toggle(item: Item, checked: boolean) {
    if (!checked) {
      setDrafts((current) =>
        current.filter((draft) => draft.sourceItemId !== item.id),
      );
      return;
    }
    const type = snapshot?.deviceTypes[0]?.code ?? "";
    const prefix = safeCode(request.request_no || request.requestNo || "PR");
    setDrafts((current) => [
      ...current,
      ...Array.from({ length: Number(item.quantity) }, (_, index) => ({
        sourceItemId: item.id,
        code: `${prefix}-${safeCode(item.item_name).slice(0, 24)}-${String(index + 1).padStart(2, "0")}`,
        nameZh: item.item_name,
        nameEn: "",
        model: item.spec || "",
        deviceTypeCode: type,
        vendorSerial: "",
        storageLocation: "",
        status: "idle" as const,
        platformCode: "",
        descriptionZh: `采购来源：${request.request_no || request.requestNo || request.id}`,
        procurementRequestId: request.id,
      })),
    ]);
  }
  const update = (index: number, patch: Partial<Draft>) =>
    setDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex === index ? { ...draft, ...patch } : draft,
      ),
    );

  async function commit() {
    if (!snapshot || !drafts.length) return;
    setBusy(true);
    setError("");
    try {
      const rows = drafts.map(({ sourceItemId, ...draft }) => {
        void sourceItemId;
        return draft;
      });
      const report = await validateLabAssetImport({
        rows,
        expectedRevision: snapshot.revision,
      });
      if (report.summary.errors) {
        const issues = report.rows.flatMap((row) =>
          row.issues
            .filter((issue) => issue.severity === "error")
            .map((issue) => `第 ${row.index} 行 ${issue.message}`),
        );
        setError(issues.slice(0, 6).join("；"));
        return;
      }
      await commitLabAssetImport({ rows, expectedRevision: snapshot.revision });
      onImported(drafts.length);
    } catch (value) {
      setError(value instanceof Error ? value.message : "资产批次创建失败。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="mx-auto my-4 w-full max-w-7xl border-t-4 border-cyan-700 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <p className="text-sm font-semibold text-cyan-800">
              采购 → 资产批次草稿
            </p>
            <h2 className="mt-1 text-2xl font-bold text-blue-950">
              将已到货设备加入实验室资产
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              选择设备类采购项，系统按数量生成资产草稿；确认后通过现有资产批量导入服务一次性提交。
            </p>
          </div>
          <button
            className="text-2xl"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>
        {error ? (
          <p
            className="mx-5 mt-4 border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <section className="p-5">
          <h3 className="font-bold text-blue-950">1. 选择设备类采购项</h3>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {eligible.map((item) => (
              <label
                className="flex items-start gap-3 border border-slate-200 p-3 text-sm"
                key={item.id}
              >
                <input
                  checked={drafts.some(
                    (draft) => draft.sourceItemId === item.id,
                  )}
                  disabled={!snapshot}
                  onChange={(event) => toggle(item, event.target.checked)}
                  type="checkbox"
                />
                <span>
                  <b>{item.item_name}</b>
                  <span className="mt-1 block text-xs text-slate-500">
                    {item.spec || "未填写型号"} · {item.quantity} 台
                  </span>
                </span>
              </label>
            ))}
          </div>
          {!eligible.length ? (
            <p className="mt-3 text-sm text-slate-500">
              没有数量为 1–100
              整数的已购条目可转换；耗材或非设备条目无需加入资产。
            </p>
          ) : null}
        </section>
        {drafts.length ? (
          <section className="border-t border-slate-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-blue-950">2. 补齐每台设备信息</h3>
                <p className="mt-1 text-xs text-slate-500">
                  采购来源：{request.request_no || request.requestNo}
                </p>
              </div>
              <span className="text-sm font-bold text-cyan-800">
                {drafts.length} 台
              </span>
            </div>
            <div className="mt-4 overflow-x-auto border border-slate-200">
              <table className="min-w-[1100px] w-full divide-y divide-slate-200 text-left">
                <thead className="sticky top-0 bg-slate-50 text-xs text-slate-600">
                  <tr>
                    {[
                      "资产编号",
                      "名称",
                      "型号",
                      "设备类型",
                      "厂商序列号",
                      "存放位置",
                    ].map((label) => (
                      <th className="px-3 py-3" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {drafts.map((draft, index) => (
                    <tr key={`${draft.sourceItemId}-${index}`}>
                      <td className="p-2">
                        <input
                          className={field}
                          onChange={(event) =>
                            update(index, { code: event.target.value })
                          }
                          value={draft.code}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          className={field}
                          onChange={(event) =>
                            update(index, { nameZh: event.target.value })
                          }
                          value={draft.nameZh}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          className={field}
                          onChange={(event) =>
                            update(index, { model: event.target.value })
                          }
                          value={draft.model}
                        />
                      </td>
                      <td className="p-2">
                        <select
                          className={field}
                          onChange={(event) =>
                            update(index, {
                              deviceTypeCode: event.target.value,
                            })
                          }
                          value={draft.deviceTypeCode}
                        >
                          <option value="">选择类型</option>
                          {snapshot?.deviceTypes.map((type) => (
                            <option key={type.code} value={type.code}>
                              {type.name} ({type.code})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <input
                          className={field}
                          onChange={(event) =>
                            update(index, { vendorSerial: event.target.value })
                          }
                          placeholder="每台设备独立序列号"
                          value={draft.vendorSerial}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          className={field}
                          onChange={(event) =>
                            update(index, {
                              storageLocation: event.target.value,
                            })
                          }
                          placeholder="实验室 / 柜位"
                          value={draft.storageLocation}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
        <footer className="sticky bottom-0 flex items-center justify-between gap-4 border-t border-slate-300 bg-white p-5">
          <p className="text-xs text-slate-500">
            提交前会再次校验资产编号、序列号、类型与当前资产修订版本。
          </p>
          <div className="flex gap-2">
            <button
              className="border border-slate-300 px-4 py-2 text-sm font-semibold"
              disabled={busy}
              onClick={onClose}
              type="button"
            >
              取消
            </button>
            <button
              className="bg-blue-950 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-400"
              disabled={
                busy ||
                !drafts.length ||
                drafts.some(
                  (draft) =>
                    !draft.code.trim() ||
                    !draft.nameZh.trim() ||
                    !draft.deviceTypeCode,
                )
              }
              onClick={() => void commit()}
              type="button"
            >
              {busy ? "正在校验并提交..." : "确认创建资产批次"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
