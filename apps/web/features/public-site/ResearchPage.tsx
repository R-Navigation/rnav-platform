"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "./PageHeader";
import { useLanguage } from "./LanguageProvider";
import { getLocalizedText } from "./i18n";
import {
  filterPublications,
  groupPublications,
  type ResearchMode,
} from "./research";
import { PublicationCard, PublicSearch } from "./ui/PublicUi";

export function ResearchPage({ data }: { data: any }) {
  const { locale } = useLanguage();
  const [mode, setMode] = useState<ResearchMode>("chronological");
  const [query, setQuery] = useState("");
  const topicLabels = useMemo(
    () =>
      new Map<string, string>(
        (data.topicLabels ?? []).map((item: any) => [
          String(item.key),
          getLocalizedText(item.label, locale) || String(item.key),
        ]),
      ),
    [data.topicLabels, locale],
  );
  const typeLabels = useMemo(
    () =>
      new Map<string, string>(
        (data.typeLabels ?? []).map((item: any) => [
          String(item.key),
          getLocalizedText(item.label, locale) || String(item.key),
        ]),
      ),
    [data.typeLabels, locale],
  );
  const filtered: any[] = useMemo(
    () => filterPublications(data.publications ?? [], query, locale),
    [data.publications, locale, query],
  );
  const featured = query ? null : filtered[0];
  const groupedItems = featured
    ? filtered.filter((item: any) => item.id !== featured.id)
    : filtered;
  const groups = useMemo(
    () =>
      groupPublications(
        groupedItems,
        mode,
        mode === "topic"
          ? (data.topicOrder ?? [])
          : mode === "type"
            ? (data.typeOrder ?? [])
            : [],
      ),
    [data.topicOrder, data.typeOrder, groupedItems, mode],
  );
  const filters = data.filters?.length
    ? data.filters
    : [
        { mode: "chronological", label: { zh: "按年份", en: "Year" } },
        { mode: "topic", label: { zh: "按主题", en: "Topic" } },
        { mode: "type", label: { zh: "按类型", en: "Type" } },
      ];
  const groupTitle = (key: string) =>
    mode === "topic"
      ? topicLabels.get(key) || key
      : mode === "type"
        ? typeLabels.get(key) || key
        : key;

  return (
    <main>
      <PageHeader header={data.header} image={featured?.image} />
      <div className="public-container public-section">
        <section className="sticky top-16 z-30 mb-12 flex flex-col gap-4 rounded-xl border border-[#e4eaf2] bg-white/95 p-3 shadow-[0_10px_30px_rgba(9,39,95,.06)] backdrop-blur sm:top-[72px] lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-1 overflow-x-auto" role="tablist">
            {filters.map((filter: any) => (
              <button
                aria-selected={mode === filter.mode}
                className={`min-h-11 shrink-0 rounded-lg px-4 text-xs font-bold uppercase tracking-wide ${mode === filter.mode ? "bg-[#09275f] text-white" : "text-[#66758f] hover:bg-[#f4f8fc] hover:text-[#1266f1]"}`}
                key={filter.mode}
                onClick={() => setMode(filter.mode as ResearchMode)}
                role="tab"
                type="button"
              >
                {getLocalizedText(filter.label, locale)}
              </button>
            ))}
          </div>
          <PublicSearch
            onChange={setQuery}
            placeholder={getLocalizedText(data.ui?.searchPlaceholder, locale)}
            value={query}
          />
        </section>
        {featured ? (
          <section className="mb-14">
            <div className="mb-5 flex items-center gap-4">
              <span className="public-kicker">
                {locale === "zh" ? "重点成果" : "FEATURED PUBLICATION"}
              </span>
              <span className="h-px flex-1 bg-[#e4eaf2]" />
            </div>
            <PublicationCard item={featured} locale={locale} />
          </section>
        ) : null}
        <div className="space-y-14">
          {groups.map(([key, items]) => (
            <section key={key}>
              <div className="mb-6 flex items-baseline justify-between gap-4 border-b border-[#e4eaf2] pb-4">
                <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[#09275f] sm:text-3xl">
                  {groupTitle(key)}
                </h2>
                <span className="text-sm text-[#66758f]">
                  {items.length}{" "}
                  {getLocalizedText(
                    items.length === 1
                      ? data.ui?.countSingle
                      : data.ui?.countPlural,
                    locale,
                  )}
                </span>
              </div>
              <div className="grid gap-5 xl:grid-cols-2">
                {items.map((item: any) => (
                  <PublicationCard
                    fallback={getLocalizedText(
                      data.ui?.previewFallback,
                      locale,
                    )}
                    item={item}
                    key={item.id}
                    locale={locale}
                  />
                ))}
              </div>
            </section>
          ))}
          {filtered.length === 0 ? (
            <section className="rounded-xl border border-[#e4eaf2] bg-white p-8 text-center">
              <h2 className="text-2xl font-semibold text-[#09275f]">
                {getLocalizedText(data.ui?.emptyTitle, locale)}
              </h2>
              <p className="mt-3 text-[#66758f]">
                {getLocalizedText(data.ui?.emptyDescription, locale)}
              </p>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
