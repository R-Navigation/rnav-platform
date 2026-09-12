"use client";

import Link from "next/link";
import { useLanguage } from "./LanguageProvider";
import {
  getLocalizedText,
  isExternalHref,
  normalizeInternalHref,
} from "./i18n";
import { sanitizePublicUrl } from "./url-sanitizer";

const defaultOrder = [
  "researchAreas",
  "featuredResearch",
  "facilities",
  "members",
  "news",
  "monitor",
  "contact",
];

function Heading({
  eyebrow,
  title,
  href,
  link,
  inverted = false,
}: {
  eyebrow: string;
  title: string;
  href: string;
  link: string;
  inverted?: boolean;
}) {
  return (
    <div className="mb-8 flex items-end justify-between gap-4">
      <div>
        <span className="public-kicker">{eyebrow}</span>
        <h2
          className={`mt-2 font-serif text-3xl font-semibold sm:text-4xl ${inverted ? "text-white" : "text-primary"}`}
        >
          {title}
        </h2>
      </div>
      <Link
        className={`shrink-0 text-sm font-semibold ${inverted ? "text-cyan-300" : "text-secondary"}`}
        href={href}
      >
        {link} →
      </Link>
    </div>
  );
}

function Monitor({ preview, status }: { preview: any; status: unknown }) {
  const { locale } = useLanguage();
  const statusText =
    preview.summary.statusText ||
    getLocalizedText(status, locale) ||
    (locale === "zh" ? "监控数据暂不可用" : "Monitor data unavailable");
  return (
    <section className="mx-auto max-w-7xl px-5 py-16 sm:px-6 lg:px-8">
      <Heading
        eyebrow={locale === "zh" ? "实时运行" : "LIVE OPERATIONS"}
        href="/monitor"
        link={locale === "zh" ? "进入监控" : "Open monitor"}
        title={locale === "zh" ? "实验状态" : "Lab status"}
      />
      <div className="grid gap-px bg-slate-700 lg:grid-cols-[1fr_2fr]">
        <div className="bg-primary p-7 text-white">
          <p className="text-sm text-blue-100">{statusText}</p>
          <p className="mt-6 text-5xl font-serif">
            {preview.devices.filter((device: any) => device.isOnline).length}
            <span className="ml-2 text-base text-blue-200">
              / {preview.devices.length} {locale === "zh" ? "在线" : "online"}
            </span>
          </p>
        </div>
        <div className="grid bg-slate-950 sm:grid-cols-2 lg:grid-cols-3">
          {preview.devices.length ? (
            preview.devices.map((device: any) => (
              <article
                className="border-b border-r border-white/10 p-5 text-white"
                key={device.code || device.displayName}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold">
                    {device.displayName || device.code}
                  </h3>
                  <span
                    className={
                      device.isOnline
                        ? "h-2.5 w-2.5 rounded-full bg-emerald-400"
                        : "h-2.5 w-2.5 rounded-full bg-slate-500"
                    }
                  />
                </div>
                <p className="mt-2 text-xs text-slate-300">
                  {device.statusLabel ||
                    (device.isOnline
                      ? locale === "zh"
                        ? "在线"
                        : "Online"
                      : locale === "zh"
                        ? "离线"
                        : "Offline")}
                </p>
              </article>
            ))
          ) : (
            <div className="col-span-full grid min-h-40 place-items-center text-sm text-slate-300">
              {locale === "zh"
                ? "当前没有公开设备状态"
                : "No public device status available"}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function HomePage({ data }: { data: any }) {
  const { locale } = useLanguage();
  const home = data.home ?? {},
    hero = home.hero ?? {},
    sections = home.sections ?? {};
  const publications = data.research?.publications ?? [];
  const researchIds = home.featuredResearchIds?.length
    ? home.featuredResearchIds
    : home.featuredPublicationId
      ? [home.featuredPublicationId]
      : publications.slice(0, 3).map((item: any) => item.id);
  const featuredResearch = researchIds
    .map((id: string) => publications.find((item: any) => item.id === id))
    .filter(Boolean);
  const facilityItems = (data.facilities?.facilitySections ?? []).flatMap(
    (section: any) => (section.items?.length ? section.items : [section]),
  );
  const facilityIds = home.featuredFacilityIds?.length
    ? home.featuredFacilityIds.map(String)
    : facilityItems.slice(0, 3).map((item: any) => String(item.id));
  const featuredFacilities = facilityIds
    .map((id: string) =>
      facilityItems.find((item: any) => String(item.id) === id),
    )
    .filter(Boolean);
  const teamMembers = [
    data.team?.facultyLead,
    ...(data.team?.advisors ?? []),
    ...(data.team?.postdocs ?? []),
    ...(data.team?.phdStudents ?? []),
    ...(data.team?.masterStudents ?? []),
    ...(data.team?.undergraduateStudents ?? []),
  ].filter(
    (item: any, index: number, all: any[]) =>
      item &&
      all.findIndex((candidate) => candidate.slug === item.slug) === index,
  );
  const memberSlugs = home.featuredMemberSlugs?.length
    ? home.featuredMemberSlugs
    : teamMembers.slice(0, 8).map((item: any) => item.slug);
  const featuredMembers = memberSlugs
    .map((slug: string) => teamMembers.find((item: any) => item.slug === slug))
    .filter(Boolean);
  const newsIds = home.newsPreviewIds ?? [];
  const newsItems = newsIds.length
    ? newsIds
        .map((id: string) =>
          (data.news?.items ?? []).find((item: any) => item.id === id),
        )
        .filter(Boolean)
    : (data.news?.items ?? []).slice(0, 4);
  const configured = Array.isArray(home.sectionOrder)
    ? home.sectionOrder.filter((key: string) => defaultOrder.includes(key))
    : [];
  const order = [...new Set([...configured, ...defaultOrder])];
  const visible = (key: string) => home.sectionVisibility?.[key] !== false;

  const modules: Record<string, React.ReactNode> = {
    researchAreas: (
      <section
        className="mx-auto max-w-7xl px-5 py-16 sm:px-6 lg:px-8"
        key="researchAreas"
      >
        <Heading
          eyebrow={locale === "zh" ? "研究议题" : "RESEARCH THEMES"}
          href="/research"
          link={
            getLocalizedText(sections.researchAreasCta, locale) ||
            (locale === "zh" ? "查看研究" : "Explore research")
          }
          title={
            getLocalizedText(sections.researchAreasTitle, locale) ||
            (locale === "zh" ? "核心研究方向" : "Core research areas")
          }
        />
        <div className="grid border-y border-slate-200 md:grid-cols-3">
          {(home.researchAreas ?? []).map((item: any, index: number) => (
            <article
              className="border-b border-slate-200 py-7 md:border-b-0 md:border-r md:px-7 first:pl-0 last:border-r-0"
              key={index}
            >
              <span className="public-kicker">
                {item.icon || `0${index + 1}`}
              </span>
              <h3 className="mt-4 font-serif text-2xl font-semibold text-primary">
                {getLocalizedText(item.title, locale)}
              </h3>
              <p className="mt-3 leading-7 text-on-surface-variant">
                {getLocalizedText(item.description, locale)}
              </p>
            </article>
          ))}
        </div>
      </section>
    ),
    featuredResearch: (
      <section
        className="bg-surface-container-low px-5 py-16 sm:px-6 lg:px-8"
        key="featuredResearch"
      >
        <div className="mx-auto max-w-7xl">
          <Heading
            eyebrow={
              getLocalizedText(sections.featuredEyebrow, locale) ||
              (locale === "zh" ? "代表成果" : "SELECTED WORK")
            }
            href="/research"
            link={
              getLocalizedText(sections.archiveLabel, locale) ||
              (locale === "zh" ? "全部成果" : "All research")
            }
            title={
              getLocalizedText(sections.featuredTitle, locale) ||
              (locale === "zh" ? "近期研究成果" : "Featured research")
            }
          />
          <div className="grid gap-5 lg:grid-cols-3">
            {featuredResearch.map((item: any) => (
              <article
                className="flex flex-col border-t-4 border-secondary bg-white p-6"
                key={item.id}
              >
                <span className="text-xs font-semibold text-slate-500">
                  {item.year || ""} · {getLocalizedText(item.venue, locale)}
                </span>
                <h3 className="mt-4 text-xl font-semibold leading-7 text-primary">
                  {getLocalizedText(item.title, locale)}
                </h3>
                <p className="mt-3 text-sm leading-6 text-on-surface-variant">
                  {(item.authors ?? [])
                    .map((author: any) => getLocalizedText(author.name, locale))
                    .join(", ")}
                </p>
                <Link
                  className="mt-auto pt-6 text-sm font-semibold text-secondary"
                  href="/research"
                >
                  {locale === "zh" ? "查看成果" : "View research"} →
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>
    ),
    facilities: (
      <section
        className="mx-auto max-w-7xl px-5 py-16 sm:px-6 lg:px-8"
        key="facilities"
      >
        <Heading
          eyebrow={locale === "zh" ? "实验基础" : "INFRASTRUCTURE"}
          href="/facilities"
          link={locale === "zh" ? "全部设备" : "All facilities"}
          title={
            locale === "zh" ? "实验平台与设备" : "Platforms and facilities"
          }
        />
        <div className="grid gap-6 lg:grid-cols-3">
          {featuredFacilities.map((item: any) => {
            const src = sanitizePublicUrl(item.image?.src);
            return (
              <article
                className="border border-slate-200 bg-white"
                key={String(item.id)}
              >
                {src ? (
                  <img
                    alt={
                      item.image?.alt || getLocalizedText(item.title, locale)
                    }
                    className="aspect-video w-full object-cover"
                    src={src}
                  />
                ) : (
                  <div className="aspect-video bg-slate-200" />
                )}
                <div className="p-5">
                  <span className="public-kicker">
                    {getLocalizedText(item.tag, locale)}
                  </span>
                  <h3 className="mt-3 text-xl font-semibold text-primary">
                    {getLocalizedText(item.title, locale)}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-on-surface-variant">
                    {getLocalizedText(item.description, locale) ||
                      getLocalizedText(item.specLine, locale)}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    ),
    members: (
      <section
        className="overflow-hidden bg-primary py-16 text-white"
        key="members"
      >
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <Heading
            eyebrow={locale === "zh" ? "共同研究" : "OUR PEOPLE"}
            href="/team"
            inverted
            link={locale === "zh" ? "全部成员" : "Meet the team"}
            title={locale === "zh" ? "团队成员" : "Research team"}
          />
          <div className="-mx-5 flex snap-x gap-4 overflow-x-auto px-5 pb-3 motion-reduce:scroll-auto sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            {featuredMembers.map((member: any) => {
              const src = sanitizePublicUrl(member.image?.src);
              return (
                <Link
                  className="w-[78vw] max-w-[280px] shrink-0 snap-start border border-white/20 bg-white/5"
                  href={`/team#${encodeURIComponent(member.slug)}`}
                  key={member.slug}
                >
                  {src ? (
                    <img
                      alt={
                        member.image?.alt ||
                        getLocalizedText(member.name, locale)
                      }
                      className="aspect-[4/3] w-full object-cover"
                      src={src}
                    />
                  ) : (
                    <div className="aspect-[4/3] bg-white/10" />
                  )}
                  <div className="p-5">
                    <h3 className="text-xl font-semibold">
                      {getLocalizedText(member.name, locale)}
                    </h3>
                    <p className="mt-2 text-sm text-blue-100">
                      {getLocalizedText(member.research, locale) ||
                        getLocalizedText(member.focus, locale) ||
                        getLocalizedText(member.degree, locale)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    ),
    news: (
      <section
        className="mx-auto max-w-7xl px-5 py-16 sm:px-6 lg:px-8"
        key="news"
      >
        <Heading
          eyebrow={
            getLocalizedText(sections.newsEyebrow, locale) ||
            (locale === "zh" ? "最新动态" : "LATEST NEWS")
          }
          href="/news"
          link={locale === "zh" ? "全部新闻" : "All news"}
          title={
            getLocalizedText(sections.newsTitle, locale) ||
            (locale === "zh" ? "团队近况" : "Recent updates")
          }
        />
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {newsItems.map((item: any) => (
            <article
              className="grid gap-3 py-5 sm:grid-cols-[120px_1fr]"
              key={item.id}
            >
              <time className="text-sm text-slate-500">
                {getLocalizedText(item.date, locale)}
              </time>
              <div>
                <h3 className="text-lg font-semibold text-primary">
                  {getLocalizedText(item.title, locale)}
                </h3>
                <p className="mt-1 text-sm leading-6 text-on-surface-variant">
                  {getLocalizedText(item.excerpt, locale) ||
                    getLocalizedText(item.description, locale)}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>
    ),
    monitor: (
      <Monitor
        key="monitor"
        preview={data.monitorPreview}
        status={hero.status}
      />
    ),
    contact: (
      <section className="bg-cyan-50 px-5 py-16 sm:px-6 lg:px-8" key="contact">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-7 md:flex-row md:items-end">
          <div>
            <span className="public-kicker">
              {locale === "zh" ? "联系与加入" : "CONTACT & OPPORTUNITIES"}
            </span>
            <h2 className="mt-3 max-w-3xl font-serif text-3xl font-semibold text-primary sm:text-4xl">
              {getLocalizedText(data.contact?.header?.title, locale) ||
                (locale === "zh"
                  ? "与我们一起探索复杂环境中的自主系统"
                  : "Explore autonomous systems with us")}
            </h2>
            <p className="mt-4 max-w-2xl leading-7 text-on-surface-variant">
              {getLocalizedText(data.contact?.header?.description, locale)}
            </p>
          </div>
          <Link
            className="shrink-0 bg-primary px-6 py-3 font-semibold text-white"
            href="/contact"
          >
            {locale === "zh" ? "联系课题组" : "Contact the lab"}
          </Link>
        </div>
      </section>
    ),
  };

  return (
    <main>
      <section className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-6 lg:grid-cols-12 lg:px-8 lg:py-24">
        <div className="self-center lg:col-span-7">
          <span className="public-kicker mb-5 block">
            {getLocalizedText(hero.eyebrow, locale)}
          </span>
          <h1 className="font-serif text-4xl font-semibold leading-tight text-primary sm:text-6xl">
            {getLocalizedText(hero.title, locale)}{" "}
            <span className="italic text-secondary">
              {getLocalizedText(hero.highlight, locale)}
            </span>
          </h1>
          <p className="public-copy mt-7 max-w-2xl">
            {getLocalizedText(hero.description, locale)}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {(hero.actions ?? []).map((action: any, index: number) => {
              const href = normalizeInternalHref(action.href);
              const className =
                action.variant === "secondary"
                  ? "border border-primary px-5 py-3 font-semibold text-primary"
                  : "bg-primary px-5 py-3 font-semibold text-white";
              return isExternalHref(href) ? (
                <a className={className} href={href} key={index}>
                  {getLocalizedText(action.label, locale)}
                </a>
              ) : (
                <Link className={className} href={href} key={index}>
                  {getLocalizedText(action.label, locale)}
                </Link>
              );
            })}
          </div>
        </div>
        <div className="lg:col-span-5">
          {sanitizePublicUrl(hero.image?.src) ? (
            <img
              alt={hero.image?.alt || ""}
              className="aspect-[4/3] w-full object-cover"
              src={sanitizePublicUrl(hero.image.src)}
            />
          ) : (
            <div className="grid aspect-[4/3] place-items-center bg-primary text-6xl font-serif text-white">
              R·NAV
            </div>
          )}
        </div>
      </section>
      {order.filter(visible).map((key) => modules[key])}
    </main>
  );
}
