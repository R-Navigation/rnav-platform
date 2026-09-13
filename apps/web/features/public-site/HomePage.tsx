"use client";

import { useLanguage } from "./LanguageProvider";
import { getLocalizedText } from "./i18n";
import {
  FacilityCard,
  MemberCard,
  NewsRow,
  PublicationCard,
  PublicButton,
  PublicImage,
  PublicSectionHeading,
} from "./ui/PublicUi";

const defaultOrder = [
  "researchAreas",
  "featuredResearch",
  "facilities",
  "members",
  "news",
  "monitor",
  "contact",
];

function Monitor({ preview, status }: { preview: any; status: unknown }) {
  const { locale } = useLanguage();
  const devices = preview?.devices ?? [];
  const statusText =
    preview?.summary?.statusText ||
    getLocalizedText(status, locale) ||
    (locale === "zh" ? "监控数据暂不可用" : "Monitor data unavailable");
  return (
    <section className="public-container public-section" key="monitor">
      <PublicSectionHeading
        eyebrow={locale === "zh" ? "实时运行" : "LIVE OPERATIONS"}
        href="/monitor"
        linkLabel={locale === "zh" ? "进入监控" : "Open monitor"}
        title={locale === "zh" ? "实验状态" : "Lab status"}
      />
      <div className="overflow-hidden rounded-xl border border-[#e4eaf2] bg-white shadow-[0_12px_35px_rgba(9,39,95,.04)]">
        <div className="flex flex-col gap-5 border-b border-[#e4eaf2] bg-[#f4f8fc] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-[#66758f]">{statusText}</p>
            <p className="mt-1 text-2xl font-semibold text-[#09275f]">
              {devices.filter((device: any) => device.isOnline).length}
              <span className="ml-2 text-sm font-medium text-[#66758f]">
                / {devices.length} {locale === "zh" ? "在线" : "online"}
              </span>
            </p>
          </div>
          <span className="inline-flex items-center gap-2 self-start rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {locale === "zh" ? "公开状态" : "Public status"}
          </span>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4">
          {devices.length ? (
            devices.map((device: any) => (
              <article
                className="border-b border-[#e4eaf2] p-5 sm:border-r"
                key={device.code || device.displayName}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="truncate font-semibold text-[#09275f]">
                    {device.displayName || device.code}
                  </h3>
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${device.isOnline ? "bg-emerald-500" : "bg-[#a8b3c2]"}`}
                  />
                </div>
                <p className="mt-2 text-xs text-[#66758f]">
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
            <p className="col-span-full p-6 text-sm text-[#66758f]">
              {locale === "zh"
                ? "当前没有公开设备状态"
                : "No public device status available"}
            </p>
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
    .filter(Boolean)
    .slice(0, 3);
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
    .filter(Boolean)
    .slice(0, 3);
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
      all.findIndex((candidate) => candidate?.slug === item.slug) === index,
  );
  const memberSlugs = home.featuredMemberSlugs?.length
    ? home.featuredMemberSlugs
    : teamMembers.slice(0, 8).map((item: any) => item.slug);
  const featuredMembers = memberSlugs
    .map((slug: string) => teamMembers.find((item: any) => item.slug === slug))
    .filter(Boolean);
  const newsIds = home.newsPreviewIds ?? [];
  const newsItems = (
    newsIds.length
      ? newsIds
          .map((id: string) =>
            (data.news?.items ?? []).find((item: any) => item.id === id),
          )
          .filter(Boolean)
      : (data.news?.items ?? [])
  ).slice(0, 4);
  const configured = Array.isArray(home.sectionOrder)
    ? home.sectionOrder.filter((key: string) => defaultOrder.includes(key))
    : [];
  const order = [...new Set([...configured, ...defaultOrder])];
  const visible = (key: string) => home.sectionVisibility?.[key] !== false;

  const modules: Record<string, React.ReactNode> = {
    researchAreas: (
      <section className="public-container public-section" key="researchAreas">
        <PublicSectionHeading
          eyebrow={locale === "zh" ? "研究议题" : "RESEARCH THEMES"}
          href="/research"
          linkLabel={
            getLocalizedText(sections.researchAreasCta, locale) ||
            (locale === "zh" ? "查看研究" : "Explore research")
          }
          title={
            getLocalizedText(sections.researchAreasTitle, locale) ||
            (locale === "zh" ? "核心研究方向" : "Core research areas")
          }
        />
        <div className="-mx-5 flex snap-x gap-4 overflow-x-auto px-5 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-4">
          {(home.researchAreas ?? []).map((item: any, index: number) => (
            <article
              className="min-w-[78vw] snap-start rounded-xl border border-[#e4eaf2] bg-white p-6 sm:min-w-0"
              key={index}
            >
              <span className="text-xs font-bold text-[#1266f1]">
                {item.icon || String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-6 text-xl font-semibold text-[#09275f]">
                {getLocalizedText(item.title, locale)}
              </h3>
              <p className="mt-3 text-sm leading-6 text-[#66758f]">
                {getLocalizedText(item.description, locale)}
              </p>
            </article>
          ))}
        </div>
      </section>
    ),
    featuredResearch: (
      <section className="bg-[#f4f8fc]" key="featuredResearch">
        <div className="public-container public-section">
          <PublicSectionHeading
            eyebrow={
              getLocalizedText(sections.featuredEyebrow, locale) ||
              (locale === "zh" ? "代表成果" : "SELECTED WORK")
            }
            href="/research"
            linkLabel={
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
              <PublicationCard
                compact
                item={item}
                key={item.id}
                locale={locale}
              />
            ))}
          </div>
        </div>
      </section>
    ),
    facilities: (
      <section className="public-container public-section" key="facilities">
        <PublicSectionHeading
          eyebrow={locale === "zh" ? "实验基础" : "INFRASTRUCTURE"}
          href="/facilities"
          linkLabel={locale === "zh" ? "全部设备" : "All facilities"}
          title={
            locale === "zh" ? "实验平台与设备" : "Platforms and facilities"
          }
        />
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {featuredFacilities.map((item: any) => (
            <FacilityCard item={item} key={String(item.id)} locale={locale} />
          ))}
        </div>
      </section>
    ),
    members: (
      <section className="border-y border-[#e4eaf2] bg-white" key="members">
        <div className="public-container public-section">
          <PublicSectionHeading
            eyebrow={locale === "zh" ? "共同研究" : "OUR PEOPLE"}
            href="/team"
            linkLabel={locale === "zh" ? "全部成员" : "Meet the team"}
            title={locale === "zh" ? "团队成员" : "Research team"}
          />
          <div className="-mx-5 flex snap-x gap-4 overflow-x-auto px-5 pb-3 sm:-mx-7 sm:px-7 lg:-mx-10 lg:px-10">
            {featuredMembers.map((member: any) => (
              <div
                className="w-[72vw] max-w-[270px] shrink-0 snap-start"
                key={member.slug}
              >
                <MemberCard locale={locale} member={member} />
              </div>
            ))}
          </div>
        </div>
      </section>
    ),
    news: (
      <section className="public-container public-section" key="news">
        <PublicSectionHeading
          eyebrow={
            getLocalizedText(sections.newsEyebrow, locale) ||
            (locale === "zh" ? "最新动态" : "LATEST NEWS")
          }
          href="/news"
          linkLabel={locale === "zh" ? "全部新闻" : "All news"}
          title={
            getLocalizedText(sections.newsTitle, locale) ||
            (locale === "zh" ? "团队近况" : "Recent updates")
          }
        />
        <div className="border-t border-[#e4eaf2]">
          {newsItems.map((item: any) => (
            <NewsRow item={item} key={item.id} locale={locale} />
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
      <section className="public-container pb-8 pt-4" key="contact">
        <div className="overflow-hidden rounded-2xl bg-[#09275f] px-6 py-9 text-white sm:px-10 sm:py-11">
          <div className="flex flex-col justify-between gap-7 md:flex-row md:items-end">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-[.14em] text-[#7cd7f5]">
                {locale === "zh" ? "联系与加入" : "CONTACT & OPPORTUNITIES"}
              </span>
              <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">
                {getLocalizedText(data.contact?.header?.title, locale) ||
                  (locale === "zh"
                    ? "与我们一起探索复杂环境中的自主系统"
                    : "Explore autonomous systems with us")}
              </h2>
              <p className="mt-4 max-w-2xl leading-7 text-blue-100">
                {getLocalizedText(data.contact?.header?.description, locale)}
              </p>
            </div>
            <PublicButton
              className="shrink-0 !bg-white !text-[#09275f] hover:!bg-blue-50"
              href="/contact"
            >
              {locale === "zh" ? "联系课题组" : "Contact the lab"}
            </PublicButton>
          </div>
        </div>
      </section>
    ),
  };

  return (
    <main>
      <section className="border-b border-[#e4eaf2] bg-white">
        <div className="public-container grid gap-10 py-12 sm:py-16 lg:grid-cols-[.9fr_1.1fr] lg:items-center lg:py-20">
          <div>
            <span className="public-kicker">
              {getLocalizedText(hero.eyebrow, locale)}
            </span>
            <h1 className="public-title mt-5">
              {getLocalizedText(hero.title, locale)}{" "}
              <span className="text-[#1266f1]">
                {getLocalizedText(hero.highlight, locale)}
              </span>
            </h1>
            <p className="public-copy mt-6 max-w-2xl">
              {getLocalizedText(hero.description, locale)}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {(hero.actions ?? [])
                .slice(0, 2)
                .map((action: any, index: number) => (
                  <PublicButton
                    href={action.href}
                    key={index}
                    variant={
                      action.variant === "secondary" ? "secondary" : "primary"
                    }
                  >
                    {getLocalizedText(action.label, locale)}
                  </PublicButton>
                ))}
            </div>
          </div>
          <PublicImage
            alt={getLocalizedText(hero.title, locale)}
            className="aspect-[16/10] rounded-2xl"
            eager
            image={hero.image}
          />
        </div>
      </section>
      {order.filter(visible).map((key) => modules[key])}
    </main>
  );
}
