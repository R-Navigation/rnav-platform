"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { validateLabAssetImport, type AssetImportReport } from "./api";
import {
  assetImportTemplateCsv,
  autoMapAssetHeaders,
  downloadCsv,
  importFieldLabels,
  importFields,
  generateMissingAssetCodes,
  mapAssetImportRows,
  parseCsv,
  type AssetImportMapping,
  type AssetImportRow,
} from "./import-export";

type Props = {
  open: boolean;
  revision: string;
  onClose(): void;
  onCommit(
    rows: AssetImportRow[],
    createMissingDeviceTypes: boolean,
  ): Promise<boolean>;
};
const field =
  "w-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100";
const primary =
  "bg-blue-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:bg-slate-400";
const secondary =
  "border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-cyan-600 hover:text-cyan-800";

async function readMatrix(file: File): Promise<unknown[][]> {
  if (file.size > 5 * 1024 * 1024) throw new Error("文件不能超过 5 MB。");
  if (file.name.toLocaleLowerCase().endsWith(".csv"))
    return parseCsv(await file.text());
  if (!file.name.toLocaleLowerCase().endsWith(".xlsx"))
    throw new Error("仅支持 .csv 或 .xlsx 文件。");
  const { readSheet } = await import("read-excel-file/browser");
  return readSheet(file);
}

export function AssetImportDialog({
  open,
  revision,
  onClose,
  onCommit,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [matrix, setMatrix] = useState<unknown[][]>([]);
  const [mapping, setMapping] = useState<AssetImportMapping | null>(null);
  const [filename, setFilename] = useState("");
  const [report, setReport] = useState<AssetImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [generateCodes, setGenerateCodes] = useState(false);
  const [createMissingDeviceTypes, setCreateMissingDeviceTypes] =
    useState(false);
  const rows = useMemo(() => {
    const mapped = mapping ? mapAssetImportRows(matrix, mapping) : [];
    return generateCodes ? generateMissingAssetCodes(mapped) : mapped;
  }, [generateCodes, mapping, matrix]);
  const requiredReady = Boolean(
    mapping &&
      (mapping.code !== null || generateCodes) &&
      mapping.nameZh !== null &&
      mapping.deviceTypeCode !== null &&
      mapping.status !== null,
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open) return;
    dialog?.showModal();
    fileRef.current?.focus();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, [open]);
  useEffect(() => {
    if (!open) {
      setMatrix([]);
      setMapping(null);
      setFilename("");
      setReport(null);
      setError("");
      setGenerateCodes(false);
      setCreateMissingDeviceTypes(false);
    }
  }, [open]);

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    setReport(null);
    try {
      const next = await readMatrix(file);
      if (next.length < 2) throw new Error("文件至少需要表头和一条设备记录。");
      if (next.length > 1_001) throw new Error("单次最多导入 1000 台设备。");
      setMatrix(next);
      setMapping(autoMapAssetHeaders(next[0]));
      setFilename(file.name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法读取文件。");
    } finally {
      setBusy(false);
    }
  }
  async function validate() {
    if (!requiredReady || !rows.length) return;
    setBusy(true);
    setError("");
    try {
      setReport(
        await validateLabAssetImport({
          rows,
          expectedRevision: revision,
          createMissingDeviceTypes,
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "校验失败。");
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    if (!report || report.summary.errors) return;
    setBusy(true);
    setError("");
    try {
      if (await onCommit(rows, createMissingDeviceTypes)) onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "导入失败。");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  return (
    <dialog
      aria-labelledby="asset-import-title"
      className="m-auto w-[calc(100%-2rem)] max-w-6xl border-0 bg-transparent p-0 backdrop:bg-slate-950/45"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      ref={dialogRef}
    >
      <section className="max-h-[92dvh] overflow-y-auto border-t-4 border-cyan-600 bg-slate-50 shadow-[0_24px_80px_rgba(15,23,42,0.24)]">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
          <div>
            <p className="text-xs font-semibold tracking-wide text-cyan-700">
              资产批量导入
            </p>
            <h2
              className="mt-1 text-2xl font-semibold tracking-tight text-slate-950"
              id="asset-import-title"
            >
              上传、映射并校验设备清单
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              支持 CSV 和
              XLSX。所有记录会在同一事务中写入，任何一条错误都会阻止整批导入。
            </p>
          </div>
          <button
            aria-label="关闭导入"
            className="text-2xl text-slate-500 hover:text-cyan-800"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>
        <div className="grid gap-6 p-6">
          <section className="grid gap-4 border-b border-slate-200 pb-6 lg:grid-cols-[1fr_auto]">
            <div>
              <h3 className="font-semibold text-slate-900">1. 上传文件</h3>
              <label
                className="mt-3 flex min-h-28 cursor-pointer items-center justify-center border border-dashed border-slate-400 bg-white px-5 text-center text-sm text-slate-600 transition hover:border-cyan-600 hover:bg-cyan-50"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void chooseFile(event.dataTransfer.files[0]);
                }}
              >
                <input
                  accept=".csv,.xlsx"
                  className="sr-only"
                  onChange={(event) => void chooseFile(event.target.files?.[0])}
                  ref={fileRef}
                  type="file"
                />
                <span>
                  {busy && !matrix.length
                    ? "正在读取文件…"
                    : filename || "选择或拖入 CSV / XLSX 文件"}
                </span>
              </label>
            </div>
            <div className="self-end">
              <button
                className={secondary}
                onClick={() =>
                  downloadCsv(
                    "RNAV_资产导入标准模板.csv",
                    assetImportTemplateCsv(),
                  )
                }
                type="button"
              >
                下载标准模板
              </button>
            </div>
          </section>

          {mapping ? (
            <section>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">2. 字段映射</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    已自动识别常见中英文列名；带 * 的字段必须映射。
                  </p>
                </div>
                <span className="font-mono text-sm text-slate-500">
                  {rows.length} 条记录
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {importFields.map((fieldName) => (
                  <label
                    className="text-xs font-semibold text-slate-600"
                    key={fieldName}
                  >
                    {importFieldLabels[fieldName]}
                    {["code", "nameZh", "deviceTypeCode", "status"].includes(
                      fieldName,
                    )
                      ? " *"
                      : ""}
                    <select
                      className={`${field} mt-1`}
                      onChange={(event) => {
                        setMapping({
                          ...mapping,
                          [fieldName]: event.target.value
                            ? Number(event.target.value)
                            : null,
                        });
                        setReport(null);
                      }}
                      value={mapping[fieldName] ?? ""}
                    >
                      <option value="">不导入</option>
                      {matrix[0].map((header, index) => (
                        <option
                          key={`${String(header)}-${index}`}
                          value={index}
                        >
                          {String(header || `第 ${index + 1} 列`)}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <div className="mt-4 grid gap-3 border border-slate-200 bg-white p-4 md:grid-cols-2">
                <fieldset>
                  <legend className="text-xs font-bold text-slate-700">
                    缺失资产编号
                  </legend>
                  <label className="mt-2 flex items-center gap-2 text-sm">
                    <input
                      checked={!generateCodes}
                      name="asset-code-strategy"
                      onChange={() => {
                        setGenerateCodes(false);
                        setReport(null);
                      }}
                      type="radio"
                    />
                    阻止导入
                  </label>
                  <label className="mt-2 flex items-center gap-2 text-sm">
                    <input
                      checked={generateCodes}
                      name="asset-code-strategy"
                      onChange={() => {
                        setGenerateCodes(true);
                        setReport(null);
                      }}
                      type="radio"
                    />
                    缺失时自动生成
                  </label>
                </fieldset>
                <fieldset>
                  <legend className="text-xs font-bold text-slate-700">
                    未知设备类型
                  </legend>
                  <label className="mt-2 flex items-center gap-2 text-sm">
                    <input
                      checked={!createMissingDeviceTypes}
                      name="device-type-strategy"
                      onChange={() => {
                        setCreateMissingDeviceTypes(false);
                        setReport(null);
                      }}
                      type="radio"
                    />
                    阻止导入
                  </label>
                  <label className="mt-2 flex items-center gap-2 text-sm">
                    <input
                      checked={createMissingDeviceTypes}
                      name="device-type-strategy"
                      onChange={() => {
                        setCreateMissingDeviceTypes(true);
                        setReport(null);
                      }}
                      type="radio"
                    />
                    提交时自动创建类型
                  </label>
                </fieldset>
              </div>
              <div className="mt-5 overflow-x-auto border-y border-slate-200 bg-white">
                <table className="min-w-[900px] text-left text-xs">
                  <thead className="bg-slate-100">
                    <tr>
                      {importFields.slice(0, 8).map((fieldName) => (
                        <th className="px-3 py-2" key={fieldName}>
                          {importFieldLabels[fieldName]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((row, index) => (
                      <tr className="border-t border-slate-100" key={index}>
                        {importFields.slice(0, 8).map((fieldName) => (
                          <td
                            className="max-w-48 truncate px-3 py-2"
                            key={fieldName}
                          >
                            {row[fieldName] || "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!requiredReady ? (
                <p className="mt-3 text-sm text-red-700" role="alert">
                  请映射设备名称、设备类型代码和状态；资产编号需映射或启用自动生成。
                </p>
              ) : null}
              <button
                className={`${primary} mt-4`}
                disabled={busy || !requiredReady || !rows.length}
                onClick={() => void validate()}
                type="button"
              >
                {busy ? "校验中…" : "校验全部记录"}
              </button>
            </section>
          ) : null}

          {report ? (
            <section aria-live="polite">
              <h3 className="font-semibold text-slate-900">3. 校验与预览</h3>
              <div className="mt-4 grid gap-px bg-slate-200 sm:grid-cols-4">
                <div className="bg-white p-4">
                  <strong className="font-mono text-2xl">
                    {report.summary.total}
                  </strong>
                  <span className="block text-xs text-slate-500">读取记录</span>
                </div>
                <div className="bg-white p-4">
                  <strong className="font-mono text-2xl text-emerald-700">
                    {report.summary.valid}
                  </strong>
                  <span className="block text-xs text-slate-500">
                    可直接导入
                  </span>
                </div>
                <div className="bg-white p-4">
                  <strong className="font-mono text-2xl text-amber-700">
                    {report.summary.warnings}
                  </strong>
                  <span className="block text-xs text-slate-500">需要确认</span>
                </div>
                <div className="bg-white p-4">
                  <strong className="font-mono text-2xl text-red-700">
                    {report.summary.errors}
                  </strong>
                  <span className="block text-xs text-slate-500">无法导入</span>
                </div>
              </div>
              {report.rows.some((row) => row.issues.length) ? (
                <div className="mt-4 max-h-72 overflow-y-auto border-y border-slate-200 bg-white">
                  {report.rows
                    .filter((row) => row.issues.length)
                    .map((row) => (
                      <div
                        className="grid gap-2 border-b border-slate-100 px-4 py-3 md:grid-cols-[6rem_10rem_1fr]"
                        key={row.index}
                      >
                        <span className="font-mono text-xs text-slate-500">
                          第 {row.index + 1} 行
                        </span>
                        <strong className="font-mono text-xs">
                          {row.row.code || "无编号"}
                        </strong>
                        <div>
                          {row.issues.map((issue, index) => (
                            <p
                              className={`text-xs ${issue.severity === "error" ? "text-red-700" : "text-amber-700"}`}
                              key={`${issue.field}-${index}`}
                            >
                              {issue.severity === "error" ? "错误" : "提示"} ·{" "}
                              {issue.message}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-emerald-700">
                  全部记录校验通过。
                </p>
              )}
            </section>
          ) : null}
          {error ? (
            <p
              className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </div>
        <footer className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-4">
          <p className="text-xs text-slate-500">
            导入前会再次检查修订版本和数据库重复项。
          </p>
          <div className="flex gap-2">
            <button className={secondary} onClick={onClose} type="button">
              取消
            </button>
            <button
              className={primary}
              disabled={busy || !report || report.summary.errors > 0}
              onClick={() => void commit()}
              type="button"
            >
              确认导入 {report ? report.summary.total : 0} 条
            </button>
          </div>
        </footer>
      </section>
    </dialog>
  );
}
