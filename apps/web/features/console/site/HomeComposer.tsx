"use client";

import { useEffect, useMemo, useState } from "react";
import type { SiteModule } from "./model";
import { PageEditor } from "./PageEditor";

type Props = {
  value: unknown;
  modules: SiteModule[];
  onChange(value: unknown): void;
};
// Site content is a schema-validated, heterogeneous JSON document.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RecordValue = Record<string, any>;
const defaultOrder = [
  "researchAreas",
  "featuredResearch",
  "facilities",
  "members",
  "news",
  "monitor",
  "contact",
];
const labels: Record<string, string> = {
  researchAreas: "研究方向",
  featuredResearch: "代表成果",
  facilities: "实验平台与设备",
  members: "团队成员",
  news: "最新动态",
  monitor: "实验状态",
  contact: "联系 / 加入",
};

const object = (value: unknown): RecordValue =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
const list = (module: SiteModule | undefined) =>
  Array.isArray(module?.value) ? (module.value as RecordValue[]) : [];
const title = (item: RecordValue) =>
  item.title?.zh || item.name?.zh || item.id || item.slug || "未命名";

function Selector({
  titleText,
  items,
  selected,
  identity,
  onChange,
}: {
  titleText: string;
  items: RecordValue[];
  selected: string[];
  identity(item: RecordValue): string;
  onChange(value: string[]): void;
}) {
  return (
    <section className="border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-blue-950">{titleText}</h3>
        <span className="text-xs text-slate-500">已选 {selected.length}</span>
      </div>
      <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
        {items.map((item) => {
          const id = identity(item);
          return (
            <label
              className="flex items-start gap-2 border border-slate-200 p-3 text-sm"
              key={id}
            >
              <input
                checked={selected.includes(id)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, id]
                      : selected.filter((value) => value !== id),
                  )
                }
                type="checkbox"
              />
              <span>{title(item)}</span>
            </label>
          );
        })}
        {!items.length ? (
          <p className="text-sm text-slate-500">权威内容集合中暂无可选项。</p>
        ) : null}
      </div>
    </section>
  );
}

export function HomeComposer({ value, modules, onChange }: Props) {
  const home = object(value);
  const [members, setMembers] = useState<RecordValue[]>([]);
  useEffect(() => {
    void fetch("/api/public/team", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => {
        const root = object(data);
        setMembers(
          [
            root.facultyLead,
            ...(root.advisors ?? []),
            ...(root.postdocs ?? []),
            ...(root.phdStudents ?? []),
            ...(root.masterStudents ?? []),
            ...(root.undergraduateStudents ?? []),
          ].filter(
            (item, index, all) =>
              item &&
              all.findIndex((candidate) => candidate.slug === item.slug) ===
                index,
          ),
        );
      })
      .catch(() => setMembers([]));
  }, []);
  const research = list(
    modules.find((module) => module.key === "research-items"),
  );
  const facilities = list(
    modules.find((module) => module.key === "facility-items"),
  ).filter((item) => item.id != null);
  const news = list(modules.find((module) => module.key === "news-items"));
  const order = useMemo(
    () =>
      [
        ...new Set([
          ...(Array.isArray(home.sectionOrder) ? home.sectionOrder : []),
          ...defaultOrder,
        ]),
      ]
        .filter((key) => defaultOrder.includes(String(key)))
        .map(String),
    [home.sectionOrder],
  );
  const visibility = object(home.sectionVisibility);
  const set = (key: string, next: unknown) =>
    onChange({ ...home, [key]: next });
  const move = (key: string, direction: number) => {
    const index = order.indexOf(key),
      target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    set("sectionOrder", next);
  };
  const editableContent = {
    hero: home.hero ?? {},
    sections: home.sections ?? {},
    researchAreas: home.researchAreas ?? [],
    featuredPublication: home.featuredPublication ?? {},
  };

  return (
    <div className="space-y-7">
      <section>
        <h3 className="font-bold text-blue-950">首页模块编排</h3>
        <p className="mt-1 text-xs text-slate-500">
          Hero 固定在首屏；其余模块可显示、隐藏和调整顺序。
        </p>
        <div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
          {order.map((key, index) => (
            <div className="flex items-center gap-3 py-3" key={key}>
              <input
                aria-label={`显示${labels[key]}`}
                checked={visibility[key] !== false}
                onChange={(event) =>
                  set("sectionVisibility", {
                    ...visibility,
                    [key]: event.target.checked,
                  })
                }
                type="checkbox"
              />
              <strong className="flex-1 text-sm text-slate-800">
                {index + 1}. {labels[key]}
              </strong>
              <button
                className="border border-slate-300 px-2 py-1 text-xs disabled:opacity-30"
                disabled={index === 0}
                onClick={() => move(key, -1)}
                type="button"
              >
                上移
              </button>
              <button
                className="border border-slate-300 px-2 py-1 text-xs disabled:opacity-30"
                disabled={index === order.length - 1}
                onClick={() => move(key, 1)}
                type="button"
              >
                下移
              </button>
            </div>
          ))}
        </div>
      </section>
      <div className="grid gap-4 xl:grid-cols-2">
        <Selector
          identity={(item) => String(item.id)}
          items={research}
          onChange={(next) => set("featuredResearchIds", next)}
          selected={
            Array.isArray(home.featuredResearchIds)
              ? home.featuredResearchIds.map(String)
              : home.featuredPublicationId
                ? [String(home.featuredPublicationId)]
                : []
          }
          titleText="代表成果"
        />
        <Selector
          identity={(item) => String(item.id)}
          items={facilities}
          onChange={(next) => set("featuredFacilityIds", next)}
          selected={
            Array.isArray(home.featuredFacilityIds)
              ? home.featuredFacilityIds.map(String)
              : []
          }
          titleText="实验设备"
        />
        <Selector
          identity={(item) => String(item.slug)}
          items={members}
          onChange={(next) => set("featuredMemberSlugs", next)}
          selected={
            Array.isArray(home.featuredMemberSlugs)
              ? home.featuredMemberSlugs.map(String)
              : []
          }
          titleText="团队成员"
        />
        <Selector
          identity={(item) => String(item.id)}
          items={news}
          onChange={(next) => set("newsPreviewIds", next)}
          selected={
            Array.isArray(home.newsPreviewIds)
              ? home.newsPreviewIds.map(String)
              : []
          }
          titleText="新闻预览"
        />
      </div>
      <section className="border-t border-slate-200 pt-6">
        <h3 className="mb-4 font-bold text-blue-950">首页文案与研究方向</h3>
        <PageEditor
          onChange={(next) => onChange({ ...home, ...object(next) })}
          value={editableContent}
        />
      </section>
    </div>
  );
}
