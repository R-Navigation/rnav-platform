"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- CMS documents are heterogeneous schema-validated JSON. */

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { ConsoleButton, ConsoleInput, ConsoleTextarea, MediaPicker } from "@/features/console/ui";

export type CmsRecord = Record<string, any>;
export const asRecord = (value: unknown): CmsRecord => value && typeof value === "object" && !Array.isArray(value) ? value as CmsRecord : {};
export const asList = (value: unknown): CmsRecord[] => Array.isArray(value) ? value.map(asRecord) : [];
export const localized = (value: unknown) => ({ zh: String(asRecord(value).zh ?? ""), en: String(asRecord(value).en ?? "") });
export const cmsId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function EditorPanel({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return <section className="rounded-xl border border-slate-200 bg-white"><header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><h3 className="font-semibold text-slate-950">{title}</h3>{description ? <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">{description}</p> : null}</div>{actions}</header><div className="p-5">{children}</div></section>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="block text-xs font-semibold text-slate-700"><span>{label}</span>{hint ? <span className="ml-2 font-normal text-slate-400">{hint}</span> : null}<span className="mt-1.5 block">{children}</span></label>;
}

export function LocalizedFields({ label, value, onChange, multiline = false }: { label: string; value: unknown; onChange: (value: { zh: string; en: string }) => void; multiline?: boolean }) {
  const current = localized(value), Control = multiline ? ConsoleTextarea : ConsoleInput;
  return <div className="grid gap-3 sm:grid-cols-2"><Field label={`${label}（中文）`}><Control value={current.zh} onChange={(event) => onChange({ ...current, zh: event.target.value })}/></Field><Field label={`${label}（English）`}><Control value={current.en} onChange={(event) => onChange({ ...current, en: event.target.value })}/></Field></div>;
}

export function MediaField({ label, value, onChange, accept = "image" }: { label: string; value: unknown; onChange: (value: CmsRecord | null) => void; accept?: "image" | "all" }) {
  const [open, setOpen] = useState(false), current = asRecord(value), src = String(current.src ?? ""), hasResource = Boolean(src || current.assetId);
  return <div><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold text-slate-700">{label}</p><p className="mt-1 text-xs text-slate-400">从媒体库选择或直接上传，保存模块后公开生效。</p></div><div className="flex gap-2"><ConsoleButton onClick={() => setOpen(true)} size="sm" type="button">{hasResource ? "更换资源" : "选择资源"}</ConsoleButton>{hasResource ? <ConsoleButton onClick={() => onChange(null)} size="sm" type="button" variant="ghost">移除</ConsoleButton> : null}</div></div>{src ? <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">{accept === "image" ? <div className="relative aspect-[16/7]"><Image alt={String(current.alt ?? label)} className="object-cover" fill sizes="700px" src={src} style={{ objectPosition: `${Number(current.positionX ?? 50)}% ${Number(current.positionY ?? 50)}%`, transform: `scale(${Number(current.zoom ?? 1)})` }} unoptimized/></div> : <p className="break-all p-3 text-xs text-slate-600">{src}</p>}<div className="grid gap-3 p-3 sm:grid-cols-2"><Field label="替代文字"><ConsoleInput value={String(current.alt ?? "")} onChange={(event) => onChange({ ...current, alt: event.target.value })}/></Field><Field label="资源 URL"><ConsoleInput value={src} onChange={(event) => onChange({ ...current, src: event.target.value })}/></Field>{accept === "image" ? <><Field label="水平焦点"><input className="w-full accent-cyan-700" max="100" min="0" type="range" value={Number(current.positionX ?? 50)} onChange={(event) => onChange({ ...current, positionX: Number(event.target.value) })}/></Field><Field label="垂直焦点"><input className="w-full accent-cyan-700" max="100" min="0" type="range" value={Number(current.positionY ?? 50)} onChange={(event) => onChange({ ...current, positionY: Number(event.target.value) })}/></Field><Field label="缩放"><input className="w-full accent-cyan-700" max="2" min="1" step="0.05" type="range" value={Number(current.zoom ?? 1)} onChange={(event) => onChange({ ...current, zoom: Number(event.target.value) })}/></Field></> : null}</div></div> : current.assetId ? <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">已关联媒体资源：{String(current.assetId)}</p> : null}<MediaPicker accept={accept} onClose={() => setOpen(false)} onSelect={(asset) => { onChange({ assetId: asset.id, src: asset.url, alt: asset.filename, positionX: 50, positionY: 50, zoom: 1 }); setOpen(false); }} open={open}/></div>;
}

export function MoveButtons({ index, length, onMove }: { index: number; length: number; onMove: (next: number) => void }) {
  return <div className="flex gap-1"><ConsoleButton aria-label="上移" disabled={index === 0} onClick={() => onMove(index - 1)} size="sm" type="button" variant="ghost">↑</ConsoleButton><ConsoleButton aria-label="下移" disabled={index === length - 1} onClick={() => onMove(index + 1)} size="sm" type="button" variant="ghost">↓</ConsoleButton></div>;
}

export function moveItem<T>(items: T[], from: number, to: number) {
  if (to < 0 || to >= items.length) return items;
  const next = [...items], [item] = next.splice(from, 1); next.splice(to, 0, item); return next;
}
