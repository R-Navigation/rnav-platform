"use client";
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
  Tag,
} from "./ui4/Primitives";
import { flattenFacilities, publishedItems } from "./ui4/content";

export function DirectionsPage({
  home,
  research,
  facilities,
}: {
  home: any;
  research: any;
  facilities: any;
}) {
  const { locale } = useLanguage();
  const zh = locale === "zh",
    text = (value: unknown) => getLocalizedText(value, locale);
  const platforms = flattenFacilities(facilities),
    areas = publishedItems<any>(home.researchAreas ?? []),
    papers = publishedItems<any>(research.publications ?? []);
  const topicFor = (area: any) =>
    area.topicKey ||
    (research.topicOrder ?? []).find((key: string) =>
      key
        .split("-")
        .some(
          (token) =>
            token.length > 3 &&
            `${text(area.title)} ${area.title?.en ?? ""}`
              .toLowerCase()
              .includes(token),
        ),
    ) ||
    "";
  const related = papers
    .filter((paper) =>
      areas.some((area) => topicFor(area) && topicFor(area) === paper.topic),
    )
    .slice(0, 4);
  return (
    <main>
      <Hero
        locale={locale}
        header={{
          title: { zh: "研究方向", en: "Research directions" },
          eyebrow: "RESEARCH DIRECTIONS",
          description: home.hero?.description,
        }}
        image={home.directionsHeroImage}
      >
        <Action href="#directions">
          {zh ? "探索研究方向" : "Explore directions"}
        </Action>
        <Action href="/research" secondary>
          {zh ? "查看论文成果" : "Publications"}
        </Action>
      </Hero>
      <section id="directions" className="v41-wrap v41-section">
        <div
          className="v41-direction-grid"
          style={
            {
              "--card-count": Math.min(areas.length, 4) || 1,
            } as React.CSSProperties
          }
        >
          {areas.map((area, index) => (
            <article
              id={`direction-${index + 1}`}
              key={index}
              className="v41-direction-card"
            >
              <Media
                image={
                  area.image ||
                  platforms[index % Math.max(platforms.length, 1)]?.image
                }
                alt={text(area.title)}
              />
              <div className="v41-card-body">
                <h2>{text(area.title)}</h2>
                <p className="v41-direction-subtitle">
                  {area.subtitle ? text(area.subtitle) : area.title?.en}
                </p>
                <p className="v41-description">{text(area.description)}</p>
                <div className="v41-tags">
                  {(area.keywords ?? []).map((tag: unknown, i: number) => (
                    <Tag key={i}>{text(tag)}</Tag>
                  ))}
                </div>
                {area.capability && (
                  <p className="v41-capability">{text(area.capability)}</p>
                )}
                <Action
                  href={
                    topicFor(area)
                      ? `/research?topic=${encodeURIComponent(topicFor(area))}`
                      : "#representative-work"
                  }
                  secondary
                >
                  {zh ? "相关论文" : "Related publications"}
                </Action>
              </div>
            </article>
          ))}
        </div>
        {!areas.length && (
          <Empty>
            {zh
              ? "研究方向尚未发布"
              : "Research directions have not been published"}
          </Empty>
        )}
      </section>
      <section id="representative-work" className="v41-band">
        <div className="v41-wrap v41-section">
          <Heading
            title={zh ? "代表性成果" : "Representative work"}
            eyebrow="REPRESENTATIVE WORK"
            href="/research"
            action={zh ? "全部成果" : "All publications"}
          />
          <div className="v41-work-grid">
            {related.length ? (
              related.map((item) => (
                <Publication item={item} locale={locale} key={item.id} />
              ))
            ) : (
              <Empty>
                {zh
                  ? "相关正式成果发布后将在这里展示。"
                  : "Related publications will appear here when published."}
              </Empty>
            )}
          </div>
        </div>
      </section>
      <section className="v41-wrap v41-section">
        <Heading
          title={zh ? "应用场景与研究问题" : "Scenarios and research questions"}
          eyebrow="APPLICATION SCENARIOS"
        />
        <div className="v41-scenario-grid">
          {areas.map((area, index) => (
            <article key={index}>
              <Media
                image={
                  area.image ||
                  platforms[index % Math.max(platforms.length, 1)]?.image
                }
                alt={text(area.title)}
              />
              <div>
                <h3>{text(area.title)}</h3>
                <p>{text(area.scenario) || text(area.description)}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <ContactCta locale={locale} />
    </main>
  );
}
