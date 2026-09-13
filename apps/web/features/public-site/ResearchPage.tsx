"use client";
import { useState } from "react";
import { useLanguage } from "./LanguageProvider";
import { getLocalizedText } from "./i18n";
import {
  filterPublications,
  groupPublications,
  type ResearchMode,
} from "./research";
import {
  ContactCta,
  Empty,
  Heading,
  Hero,
  Publication,
  Search,
} from "./ui4/Primitives";
import { isDemoContent, publishedItems } from "./ui4/content";

export function ResearchPage({
  data,
  initialTopic = "all",
  featuredId,
}: {
  data: any;
  initialTopic?: string;
  featuredId?: string;
}) {
  const { locale } = useLanguage(),
    zh = locale === "zh";
  const text = (value: unknown) => getLocalizedText(value, locale);
  const [query, setQuery] = useState(""),
    [topic, setTopic] = useState(initialTopic),
    [type, setType] = useState("all"),
    [year, setYear] = useState("all"),
    [mode, setMode] = useState<ResearchMode>("chronological");
  const all = publishedItems<any>(data.publications ?? []);
  const topics = [
    ...new Set<string>(
      [
        ...(data.topicOrder ?? []),
        ...all.map((item) => String(item.topic ?? "")),
      ].filter(Boolean),
    ),
  ];
  const types = [
    ...new Set<string>(
      [
        ...(data.typeOrder ?? []),
        ...all.map((item) => String(item.type ?? "")),
      ].filter(Boolean),
    ),
  ];
  const years = [
    ...new Set<string>(
      all.map((item) => String(item.year ?? "")).filter(Boolean),
    ),
  ].sort((a, b) => Number(b) - Number(a));
  const label = (key: string, kind: "topic" | "type") => {
    const index = (data[`${kind}Order`] ?? []).indexOf(key);
    const item =
      (data[`${kind}Labels`] ?? []).find((item: any) => item.key === key) ||
      data[`${kind}Labels`]?.[index];
    return text(item?.label) || key;
  };
  const filtered = filterPublications(all, query, locale).filter(
    (item) =>
      (topic === "all" || item.topic === topic) &&
      (type === "all" || item.type === type) &&
      (year === "all" || String(item.year) === year),
  );
  const featured =
    filtered.find((item) => String(item.id) === String(featuredId)) ||
    filtered[0];
  const archive = filtered.filter((item) => item !== featured),
    groups = groupPublications(
      archive,
      mode,
      mode === "topic" ? topics : mode === "type" ? types : [],
    );
  const reset = () => {
    setQuery("");
    setTopic("all");
    setType("all");
    setYear("all");
  };
  const taxonomy = (
    <>
      {(
        [
          {
            kind: "topic",
            values: topics,
            current: topic,
            set: setTopic,
            title: zh ? "研究方向" : "Research directions",
          },
          {
            kind: "type",
            values: types,
            current: type,
            set: setType,
            title: zh ? "论文类型" : "Publication type",
          },
        ] as const
      ).map((group) => (
        <section key={group.kind}>
          <h2>{group.title}</h2>
          <button
            type="button"
            aria-pressed={group.current === "all"}
            onClick={() => group.set("all")}
          >
            {zh ? "全部" : "All"}
            <span>{all.length}</span>
          </button>
          {group.values.map((value) => (
            <button
              type="button"
              aria-pressed={group.current === value}
              key={value}
              onClick={() => group.set(value)}
            >
              {label(value, group.kind)}
              <span>
                {all.filter((item) => item[group.kind] === value).length}
              </span>
            </button>
          ))}
        </section>
      ))}
    </>
  );
  return (
    <main>
      <Hero
        header={{
          ...data.header,
          title: { zh: "论文成果", en: "Publications" },
          eyebrow: "PUBLICATIONS",
          description: isDemoContent(data.header)
            ? {zh:"按研究方向、年份与论文类型浏览公开成果，检索标题、作者与关键词。",en:"Browse public research by topic, year and publication type. Search titles, authors and keywords."}
            : data.header?.description,
        }}
        locale={locale}
      />
      <section className="v41-wrap v41-section">
        <div className="v41-filter-bar">
          <label>
            {zh ? "按年份" : "Year"}
            <select value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="all">{zh ? "全部年份" : "All years"}</option>
              {years.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            {zh ? "按主题" : "Topic"}
            <select value={topic} onChange={(e) => setTopic(e.target.value)}>
              <option value="all">{zh ? "全部方向" : "All topics"}</option>
              {topics.map((value) => (
                <option key={value} value={value}>
                  {label(value, "topic")}
                </option>
              ))}
            </select>
          </label>
          <label>
            {zh ? "按类型" : "Type"}
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="all">{zh ? "全部类型" : "All types"}</option>
              {types.map((value) => (
                <option key={value} value={value}>
                  {label(value, "type")}
                </option>
              ))}
            </select>
          </label>
          <div className="v41-filter-chips">
            <button
              type="button"
              onClick={reset}
              aria-pressed={
                topic === "all" && type === "all" && year === "all" && !query
              }
            >
              {zh ? "全部" : "All"}
            </button>
            {topics.map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={topic === value}
                onClick={() => setTopic(value)}
              >
                {label(value, "topic")}
              </button>
            ))}
          </div>
          <Search
            value={query}
            onChange={setQuery}
            placeholder={
              zh
                ? "搜索标题、作者或关键词…"
                : "Search title, author or keyword…"
            }
          />
        </div>
        <details className="v41-filter-drawer">
          <summary>
            {zh ? "分类筛选" : "Browse filters"} <span>＋</span>
          </summary>
          <div className="v41-taxonomy">{taxonomy}</div>
        </details>
      </section>
      <section className="v41-wrap v41-publications-layout">
        <aside
          className="v41-taxonomy v41-desktop-taxonomy"
          aria-label={zh ? "成果分类" : "Publication taxonomy"}
        >
          {taxonomy}
        </aside>
        <div className="v41-publications-main">
          <section>
            <Heading
              title={zh ? "重点成果" : "Featured publication"}
              eyebrow="FEATURED PUBLICATION"
            />
            {featured ? (
              <Publication item={featured} locale={locale} featured />
            ) : (
              <Empty>
                {zh
                  ? "暂无符合条件的正式论文成果。"
                  : "No published papers match these filters."}
              </Empty>
            )}
          </section>
          <section className="v41-section">
            <div className="v41-archive-heading">
              <Heading
                title={zh ? "全部成果" : "Publication archive"}
                eyebrow="PUBLICATION ARCHIVE"
              />
              <label>
                {zh ? "分组" : "Group by"}
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as ResearchMode)}
                >
                  <option value="chronological">{zh ? "年份" : "Year"}</option>
                  <option value="topic">{zh ? "主题" : "Topic"}</option>
                  <option value="type">{zh ? "类型" : "Type"}</option>
                </select>
              </label>
            </div>
            <p className="v41-muted" role="status">
              {zh
                ? `共 ${filtered.length} 篇正式成果`
                : `${filtered.length} published papers`}
            </p>
            {groups.map(([key, items]) => (
              <section className="v41-archive-group" key={key}>
                <h3>{mode === "chronological" ? key : label(key, mode)}</h3>
                <div className="v41-paper-grid">
                  {items.map((item) => (
                    <Publication key={item.id} item={item} locale={locale} />
                  ))}
                </div>
              </section>
            ))}
            {!archive.length && (
              <Empty>
                {zh
                  ? featured
                    ? "其余归档成果将在发布后展示。"
                    : "暂无正式归档成果，可调整筛选或稍后访问。"
                  : featured
                    ? "More papers will appear here when published."
                    : "No published archive entries. Adjust filters or check back later."}
              </Empty>
            )}
            {(query || topic !== "all" || type !== "all" || year !== "all") && (
              <button
                className="v41-button v41-reset"
                type="button"
                onClick={reset}
              >
                {zh ? "清除筛选" : "Clear filters"}
              </button>
            )}
          </section>
        </div>
      </section>
      <ContactCta locale={locale} />
    </main>
  );
}
