"use client";
import { useState } from "react";
import { useLanguage } from "./LanguageProvider";
import { getLocalizedText } from "./i18n";
import {
  Action,
  ContactCta,
  Empty,
  Heading,
  Hero,
  Media,
  Search,
  Tag,
} from "./ui4/Primitives";
import { isDemoContent, publishedItems } from "./ui4/content";

export function NewsPage({ data, heroImage }: { data: any; heroImage?: any }) {
  const { locale } = useLanguage(),
    zh = locale === "zh",
    text = (value: unknown) => getLocalizedText(value, locale);
  const [year, setYear] = useState("all"),
    [category, setCategory] = useState("all"),
    [query, setQuery] = useState("");
  const dateOf = (item: any) =>
    getLocalizedText(item.date, "en") || getLocalizedText(item.date, "zh");
  const yearOf = (item: any) =>
    dateOf(item).match(/\b(?:19|20)\d{2}\b/)?.[0] || "";
  const all = publishedItems<any>(data.items ?? []).sort(
    (a, b) => (Date.parse(dateOf(b)) || 0) - (Date.parse(dateOf(a)) || 0),
  );
  const years = [...new Set(all.map(yearOf).filter(Boolean))].sort().reverse(),
    categories = [
      ...new Set<string>(
        all.map((item) => text(item.category)).filter(Boolean),
      ),
    ];
  const filtered = all.filter(
    (item) =>
      (year === "all" || yearOf(item) === year) &&
      (category === "all" || text(item.category) === category) &&
      `${text(item.title)} ${text(item.excerpt)} ${text(item.description)}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  const featured =
      filtered.find((item) => item.pinned || item.featured) || filtered[0],
    archive = filtered.filter((item) => item !== featured);
  const linkOf = (item: any) =>
    item.link?.href || item.links?.[0]?.href || item.href || "";
  return (
    <main>
      <Hero
        header={{
          ...data.header,
          title: { zh: "新闻动态", en: "News and events" },
          eyebrow: "NEWS & EVENTS",
          description: isDemoContent(data.header)
            ? {
                zh: "关注团队公开发布的科研进展、活动与公告。",
                en: "Follow the team’s published research updates, events and announcements.",
              }
            : data.header?.description,
        }}
        locale={locale}
        image={featured?.image || heroImage}
      />
      <section className="v41-wrap v41-section">
        <Heading
          title={zh ? "重点动态" : "Featured update"}
          eyebrow="FEATURED NEWS"
        />
        {featured ? (
          <article className="v41-featured-news">
            <Media image={featured.image} alt={text(featured.title)} />
            <div className="v41-card-body">
              <p className="v41-eyebrow">
                <time>{text(featured.date)}</time>
              </p>
              {text(featured.category) && <Tag>{text(featured.category)}</Tag>}
              <h2>{text(featured.title)}</h2>
              <p className="v41-description">
                {text(featured.excerpt) || text(featured.description)}
              </p>
              <Action href={linkOf(featured)}>
                {text(featured.link?.label) || (zh ? "阅读详情" : "Read more")}
              </Action>
            </div>
          </article>
        ) : (
          <div className="v41-featured-news v41-news-empty">
            <Media alt={zh ? "新闻动态" : "News"} />
            <Empty>
              {zh
                ? "正式团队动态发布后将在这里展示。"
                : "Team updates will appear here when published."}
            </Empty>
          </div>
        )}
      </section>
      <section className="v41-wrap v41-section">
        <div className="v41-news-filter">
          <Heading
            title={zh ? "全部动态" : "News archive"}
            eyebrow="NEWS ARCHIVE"
          />
          <label>
            {zh ? "年份" : "Year"}
            <select
              value={year}
              onChange={(event) => setYear(event.target.value)}
            >
              <option value="all">{zh ? "全部年份" : "All years"}</option>
              {years.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          {categories.length > 0 && (
            <label>
              {zh ? "分类" : "Category"}
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="all">
                  {zh ? "全部分类" : "All categories"}
                </option>
                {categories.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          )}
          <Search
            value={query}
            onChange={setQuery}
            placeholder={zh ? "搜索团队动态…" : "Search updates…"}
          />
        </div>
        <p className="v41-muted" role="status">
          {zh
            ? `共 ${filtered.length} 条正式动态`
            : `${filtered.length} published updates`}
        </p>
        <div className="v41-news-grid">
          {archive.map((item) => (
            <article className="v41-news-card" key={item.id}>
              <Media image={item.image} alt={text(item.title)} />
              <div>
                <time>{text(item.date)}</time>
                {text(item.category) && <Tag>{text(item.category)}</Tag>}
                <h3>{text(item.title)}</h3>
                <p>{text(item.excerpt) || text(item.description)}</p>
                {text(item.description) &&
                  text(item.description) !== text(item.excerpt) && (
                    <details>
                      <summary>{zh ? "展开全文" : "Full update"}</summary>
                      <p>{text(item.description)}</p>
                    </details>
                  )}
                <Action href={linkOf(item)} secondary>
                  {zh ? "阅读详情" : "Read more"}
                </Action>
              </div>
            </article>
          ))}
        </div>
        {!archive.length && (
          <Empty>
            {zh
              ? featured
                ? "更多动态将在发布后展示。"
                : "暂无正式新闻，可调整筛选或稍后访问。"
              : featured
                ? "More updates will appear here when published."
                : "No published news. Adjust filters or check back later."}
          </Empty>
        )}
      </section>
      <ContactCta locale={locale} />
    </main>
  );
}
