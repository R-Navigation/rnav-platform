"use client";

import Link from "next/link";
import { useLanguage } from "./LanguageProvider";
import { getLocalizedText } from "./i18n";
import {
  Action,
  ContactCta,
  Empty,
  Heading,
  Hero,
  Media,
  Publication,
} from "./ui4/Primitives";
import {
  flattenFacilities,
  homeSlots,
  publishedItems,
  selectConfigured,
} from "./ui4/content";

export function HomePage({ data }: { data: any }) {
  const { locale } = useLanguage();
  const zh = locale === "zh",
    home = data.home ?? {},
    hero = home.hero ?? {},
    sections = home.sections ?? {};
  const text = (value: unknown) => getLocalizedText(value, locale);
  const visible = (key: string) => home.sectionVisibility?.[key] !== false;
  const facilities = flattenFacilities(data.facilities ?? {});
  const selectedFacilities = selectConfigured(
    facilities,
    home.featuredFacilityIds ?? [],
    home.featuredFacilityIds?.length ? "id" : "displayKey",
    4,
  );
  const publications = selectConfigured(
    publishedItems(data.research?.publications ?? []),
    home.featuredResearchIds?.length
      ? home.featuredResearchIds
      : home.featuredPublicationId
        ? [home.featuredPublicationId]
        : [],
    "id",
    3,
  );
  const members = [
    data.team?.facultyLead,
    ...(data.team?.advisors ?? []),
    ...(data.team?.postdocs ?? []),
    ...(data.team?.phdStudents ?? []),
    ...(data.team?.masterStudents ?? []),
    ...(data.team?.undergraduateStudents ?? []),
  ].filter(Boolean);
  const selectedMembers = selectConfigured(
    home.featuredMemberSlugs?.length
      ? [...members, ...(data.team?.alumni ?? [])]
      : members,
    home.featuredMemberSlugs ?? [],
    "slug",
    5,
  );
  const news = selectConfigured(
    publishedItems(data.news?.items ?? []),
    home.newsPreviewIds ?? [],
    "id",
    4,
  );
  const areas = publishedItems<any>(home.researchAreas ?? []).slice(0, 4);
  const heroImage =
    hero.image?.src && !/示意|demo|example/i.test(hero.image.alt ?? "")
      ? hero.image
      : facilities.find((item) => item.image?.src)?.image;
  const modules: Record<string, React.ReactNode> = {
    directions: visible("researchAreas") && (
      <section className="v41-wrap v41-section" key="directions">
        <Heading
          title={
            text(sections.researchAreasTitle) ||
            (zh ? "研究方向" : "Research directions")
          }
          eyebrow="RESEARCH DIRECTIONS"
          href="/directions"
          action={zh ? "查看全部" : "Explore"}
        />
        <div
          className="v41-direction-teasers"
          style={{ "--card-count": areas.length || 1 } as React.CSSProperties}
        >
          {areas.map((area: any, index: number) => (
            <Link
              href={`/directions#direction-${index + 1}`}
              className="v41-direction-teaser"
              key={index}
            >
              <Media
                image={
                  area.image ||
                  facilities[index % Math.max(facilities.length, 1)]?.image
                }
                alt={text(area.title)}
              />
              <div>
                <h3>{text(area.title)}</h3>
                <p className="v41-english">{area.title?.en}</p>
                <p>{text(area.description)}</p>
                <span className="v41-card-arrow" aria-hidden="true">
                  →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    ),
    work: (visible("featuredResearch") || visible("facilities")) && (
      <section className="v41-band" key="work">
        <div
          className={`v41-wrap v41-section v41-pair ${!visible("featuredResearch") || !visible("facilities") ? "v41-pair-single" : ""}`}
        >
          {visible("featuredResearch") && (
            <div>
              <Heading
                title={
                  text(sections.featuredTitle) ||
                  (zh ? "论文成果" : "Selected publications")
                }
                eyebrow="SELECTED PUBLICATIONS"
                href="/research"
                action={zh ? "全部成果" : "View all"}
              />
              <div className="v41-stack">
                {publications.length ? (
                  publications.map((item: any) => (
                    <Publication item={item} locale={locale} key={item.id} />
                  ))
                ) : (
                  <Empty>
                    {zh
                      ? "正式论文成果发布后将在这里展示。"
                      : "Published research will appear here when available."}
                  </Empty>
                )}
              </div>
            </div>
          )}
          {visible("facilities") && (
            <div>
              <Heading
                title={zh ? "实验平台" : "Experimental platforms"}
                eyebrow="EXPERIMENTAL PLATFORMS"
                href="/facilities"
                action={zh ? "查看全部" : "View all"}
              />
              <div className="v41-facility-teasers">
                {selectedFacilities.map((item) => (
                  <Link
                    className="v41-facility-teaser"
                    href="/facilities"
                    key={item.displayKey}
                  >
                    <Media image={item.image} alt={text(item.title)} />
                    <h3>
                      {text(item.title)} <span aria-hidden="true">→</span>
                    </h3>
                  </Link>
                ))}
              </div>
              {!selectedFacilities.length && (
                <Empty>
                  {zh ? "暂无公开实验平台" : "No public platforms yet"}
                </Empty>
              )}
            </div>
          )}
        </div>
      </section>
    ),
    people: (visible("members") || visible("news")) && (
      <section
        className={`v41-wrap v41-section v41-pair ${!visible("members") || !visible("news") ? "v41-pair-single" : ""}`}
        key="people"
      >
        {visible("members") && (
          <div>
            <Heading
              title={zh ? "团队成员" : "Our team"}
              eyebrow="OUR TEAM"
              href="/team"
              action={zh ? "认识团队" : "Meet the team"}
            />
            <div className="v41-home-members">
              {selectedMembers.map((member: any) => (
                <Link href={`/team#${member.slug}`} key={member.slug}>
                  <Media image={member.image} alt={text(member.name)} />
                  <h3>{text(member.name)}</h3>
                  <p>{text(member.degree) || text(member.role)}</p>
                  <p className="line-clamp-2">
                    {text(member.research) || text(member.focus)}
                  </p>
                </Link>
              ))}
            </div>
            {!selectedMembers.length && (
              <Empty>
                {zh ? "暂无公开成员信息" : "No public profiles yet"}
              </Empty>
            )}
          </div>
        )}
        {visible("news") && (
          <div>
            <Heading
              title={
                text(sections.newsTitle) || (zh ? "新闻动态" : "Latest news")
              }
              eyebrow="LATEST NEWS"
              href="/news"
              action={zh ? "查看全部" : "View all"}
            />
            <div className="v41-news-teasers">
              {news.length ? (
                news.map((item: any) => (
                  <Link href="/news" key={item.id}>
                    <time>{text(item.date)}</time>
                    <h3>{text(item.title)}</h3>
                    <span aria-hidden="true">→</span>
                  </Link>
                ))
              ) : (
                <Empty>
                  {zh
                    ? "正式团队动态发布后将在这里展示。"
                    : "Team updates will appear here when published."}
                </Empty>
              )}
            </div>
          </div>
        )}
      </section>
    ),
    status: visible("monitor") && (
      <section className="v41-wrap v41-status" key="status">
        <div>
          <span className="v41-eyebrow">LAB STATUS</span>
          <h2>{zh ? "实验室运行状态" : "Lab status"}</h2>
        </div>
        <div className="v41-status-devices">
          {data.monitorPreview?.devices?.length ? (
            data.monitorPreview.devices.slice(0, 4).map((device: any) => (
              <span key={device.code}>
                <i className={device.isOnline ? "is-online" : ""} />
                {device.displayName || device.code}
                <small>
                  {device.statusLabel ||
                    (device.isOnline
                      ? zh
                        ? "在线"
                        : "Online"
                      : zh
                        ? "离线"
                        : "Offline")}
                </small>
              </span>
            ))
          ) : (
            <p>
              {zh
                ? "当前没有可用的公开设备状态"
                : "Public device status is currently unavailable"}
            </p>
          )}
        </div>
        <Link href="/monitor">{zh ? "查看状态" : "View status"} →</Link>
      </section>
    ),
    contact: visible("contact") && (
      <ContactCta
        key="contact"
        locale={locale}
        title={data.contact?.header?.title}
        description={data.contact?.header?.description}
      />
    ),
  };
  return (
    <main>
      <Hero home header={hero} locale={locale} image={heroImage}>
        {(hero.actions?.length
          ? hero.actions
          : [
              {
                href: "/directions",
                label: { zh: "了解我们的研究", en: "Explore research" },
              },
              {
                href: "/facilities",
                label: { zh: "了解实验平台", en: "Explore platforms" },
                variant: "secondary",
              },
            ]
        )
          .slice(0, 2)
          .map((action: any, index: number) => (
            <Action
              key={index}
              href={
                action.href === "/research" &&
                /方向|directions/i.test(text(action.label))
                  ? "/directions"
                  : action.href
              }
              secondary={action.variant === "secondary"}
            >
              {text(action.label)}
            </Action>
          ))}
      </Hero>
      {homeSlots(home.sectionOrder).map((slot) => modules[slot])}
    </main>
  );
}
