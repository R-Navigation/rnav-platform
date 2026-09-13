"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- CMS documents are heterogeneous schema-validated JSON. */

import { useEffect, useMemo, useState } from "react";
import type { SiteModule } from "./model";
import { asList, asRecord, EditorPanel, LocalizedFields, MediaField, MoveButtons, moveItem } from "./CmsFields";

type Item = Record<string, any>;
const slots = ["directions", "work", "people", "status", "contact"];
const labels: Record<string, string> = { directions: "研究方向", work: "研究与实验", people: "团队与动态", status: "实验状态", contact: "联系与加入" };
const children: Record<string, [string, string][]> = { directions: [["researchAreas", "显示研究方向"]], work: [["featuredResearch", "显示论文成果"], ["facilities", "显示实验平台"]], people: [["members", "显示团队成员"], ["news", "显示新闻"]], status: [["monitor", "显示实验状态"]], contact: [["contact", "显示联系与加入"]] };
const title = (item: Item) => item.title?.zh || item.name?.zh || item.title?.en || item.name?.en || item.id || item.slug || "未命名";

function Selector({ titleText, items, selected, identity, onChange }: { titleText: string; items: Item[]; selected: string[]; identity: (item: Item) => string; onChange: (ids: string[]) => void }) {
  return <EditorPanel title={titleText} description={`已选 ${selected.length}`}><div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">{items.map((item) => { const id = identity(item); return <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm transition hover:border-cyan-300" key={id}><input checked={selected.includes(id)} onChange={(event) => onChange(event.target.checked ? [...selected, id] : selected.filter((value) => value !== id))} type="checkbox"/><span>{title(item)}</span></label>; })}{!items.length ? <p className="text-sm text-slate-500">权威内容集合中暂无可选项。</p> : null}</div></EditorPanel>;
}

export function HomeComposer({ value, modules, onChange }: { value: unknown; modules: SiteModule[]; onChange: (value: unknown) => void }) {
  const home = asRecord(value), [members, setMembers] = useState<Item[]>([]), [facilities, setFacilities] = useState<Item[]>([]);
  useEffect(() => { void fetch("/api/public/team", { cache: "no-store" }).then((response) => response.ok ? response.json() : Promise.reject()).then((data) => { const root = asRecord(data); setMembers([root.facultyLead, ...(root.advisors ?? []), ...(root.postdocs ?? []), ...(root.phdStudents ?? []), ...(root.masterStudents ?? []), ...(root.undergraduateStudents ?? []), ...(root.alumni ?? [])].filter((item, index, all) => item && all.findIndex((candidate) => candidate.slug === item.slug) === index)); }).catch(() => setMembers([])); }, []);
  useEffect(() => { void fetch("/api/public/facilities", { cache: "no-store" }).then((response) => response.ok ? response.json() : Promise.reject()).then((data) => setFacilities(asList(asRecord(data).facilitySections).flatMap((section) => ["platform", "asset"].includes(String(section.kind)) ? asList(section.items) : []))).catch(() => setFacilities([])); }, []);
  const research = asList(modules.find((module) => module.key === "research-items")?.value), news = asList(modules.find((module) => module.key === "news-items")?.value);
  const order = useMemo(() => [...new Set([...(Array.isArray(home.compositionOrder) ? home.compositionOrder : []), ...slots])].map(String).filter((key) => slots.includes(key)), [home.compositionOrder]);
  const visibility = asRecord(home.sectionVisibility), hero = asRecord(home.hero), sections = asRecord(home.sections);
  const set = (key: string, next: unknown) => onChange({ ...home, [key]: next });
  const selected = (key: string, legacy?: unknown) => (Array.isArray(home[key]) ? home[key] : legacy ? [legacy] : []).map(String);
  const slotVisible = (slot: string) => children[slot].some(([key]) => visibility[key] !== false);
  const toggleSlot = (slot: string, visible: boolean) => set("sectionVisibility", { ...visibility, ...Object.fromEntries(children[slot].map(([key]) => [key, visible])) });
  return <div className="space-y-5">
    <p className="text-xs font-semibold text-cyan-800">来源：官网内容 · 首页编排</p>
    <EditorPanel title="首页组合编排" description="Hero 固定在首屏；组合槽可以调整顺序，组合内部可单独控制显示。"><div className="divide-y divide-slate-200 border-y border-slate-200">{order.map((slot, index) => <div className="flex flex-wrap items-center gap-3 py-3" key={slot}><input aria-label={`显示${labels[slot]}`} checked={slotVisible(slot)} onChange={(event) => toggleSlot(slot, event.target.checked)} type="checkbox"/><strong className="min-w-36 flex-1 text-sm text-slate-900">{index + 1}. {labels[slot]}</strong>{children[slot].length > 1 ? <div className="flex flex-wrap gap-3">{children[slot].map(([key, childLabel]) => <label className="flex items-center gap-1.5 text-xs text-slate-600" key={key}><input checked={visibility[key] !== false} onChange={(event) => set("sectionVisibility", { ...visibility, [key]: event.target.checked })} type="checkbox"/>{childLabel}</label>)}</div> : null}<MoveButtons index={index} length={order.length} onMove={(target) => set("compositionOrder", moveItem(order, index, target))}/></div>)}</div></EditorPanel>
    <div className="grid gap-4 xl:grid-cols-2"><Selector identity={(item) => String(item.id)} items={research} onChange={(ids) => set("featuredResearchIds", ids)} selected={selected("featuredResearchIds", home.featuredPublicationId)} titleText="代表论文"/><Selector identity={(item) => String(item.id)} items={facilities} onChange={(ids) => set("featuredFacilityIds", ids)} selected={selected("featuredFacilityIds")} titleText="公开平台与设备"/><Selector identity={(item) => String(item.slug)} items={members} onChange={(ids) => set("featuredMemberSlugs", ids)} selected={selected("featuredMemberSlugs")} titleText="精选成员"/><Selector identity={(item) => String(item.id)} items={news} onChange={(ids) => set("newsPreviewIds", ids)} selected={selected("newsPreviewIds")} titleText="新闻预览"/></div>
    {!facilities.length ? <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">实验室资产中暂无已公开的 Public Profile。请先完成“实验室资产 → 对外展示”，这里不再提供 legacy 设备作为候选。</p> : null}
    <EditorPanel title="首页 Hero" description="研究方向由独立模块维护，不在首页重复编辑。"><div className="space-y-5"><LocalizedFields label="眉题" value={hero.eyebrow} onChange={(next) => set("hero", { ...hero, eyebrow: next })}/><LocalizedFields label="主标题" value={hero.title} onChange={(next) => set("hero", { ...hero, title: next })}/><LocalizedFields label="强调文字" value={hero.highlight} onChange={(next) => set("hero", { ...hero, highlight: next })}/><LocalizedFields label="简介" multiline value={hero.description} onChange={(next) => set("hero", { ...hero, description: next })}/><MediaField label="Hero 图片" value={hero.image} onChange={(next) => set("hero", { ...hero, image: next })}/></div></EditorPanel>
    <EditorPanel title="首页区块标题"><div className="space-y-5"><LocalizedFields label="研究方向" value={sections.researchAreasTitle} onChange={(next) => set("sections", { ...sections, researchAreasTitle: next })}/><LocalizedFields label="代表成果" value={sections.featuredTitle} onChange={(next) => set("sections", { ...sections, featuredTitle: next })}/><LocalizedFields label="新闻动态" value={sections.newsTitle} onChange={(next) => set("sections", { ...sections, newsTitle: next })}/></div></EditorPanel>
  </div>;
}
