"use client";

import Link from "next/link";
import { PageHeader } from "./PageHeader";
import { useLanguage } from "./LanguageProvider";
import {
  getLocalizedText,
  isExternalHref,
  normalizeInternalHref,
} from "./i18n";
import { NewsRow, PublicButton, PublicImage, PublicTag } from "./ui/PublicUi";

export function NewsPage({ data }: { data: any }) {
  const { locale } = useLanguage();
  const items = data.items ?? [];
  const featured = items.find((item: any) => item.featured) || items[0];
  const rest = featured
    ? items.filter((item: any) => item.id !== featured.id)
    : items;
  return (
    <main>
      <PageHeader header={data.header} image={featured?.image} />
      <div className="public-container public-section">
        {featured ? (
          <article className="mb-14 overflow-hidden rounded-2xl border border-[#e4eaf2] bg-white shadow-[0_16px_45px_rgba(9,39,95,.06)] lg:grid lg:grid-cols-[1.05fr_.95fr]">
            <PublicImage
              alt={getLocalizedText(featured.title, locale)}
              className="min-h-[280px]"
              image={featured.image}
            />
            <div className="flex flex-col justify-center p-7 sm:p-10">
              <div className="flex flex-wrap items-center gap-3">
                <PublicTag>
                  {getLocalizedText(featured.badge, locale) ||
                    (locale === "zh" ? "最新动态" : "Latest")}
                </PublicTag>
                <time className="text-sm text-[#66758f]">
                  {getLocalizedText(featured.date, locale)}
                </time>
              </div>
              <h2 className="mt-5 text-3xl font-semibold tracking-[-0.025em] text-[#09275f]">
                {getLocalizedText(featured.title, locale)}
              </h2>
              <p className="mt-4 leading-7 text-[#66758f]">
                {getLocalizedText(featured.description, locale)}
              </p>
              {featured.link ? (
                isExternalHref(featured.link.href) ? (
                  <a
                    className="mt-6 inline-flex min-h-11 items-center self-start font-semibold text-[#1266f1]"
                    href={normalizeInternalHref(featured.link.href)}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {getLocalizedText(featured.link.label, locale)}
                  </a>
                ) : (
                  <PublicButton
                    className="mt-6 self-start"
                    href={normalizeInternalHref(featured.link.href)}
                    variant="ghost"
                  >
                    {getLocalizedText(featured.link.label, locale)}
                  </PublicButton>
                )
              ) : null}
            </div>
          </article>
        ) : null}
        <section>
          <div className="mb-5 flex items-center justify-between border-b border-[#e4eaf2] pb-4">
            <h2 className="text-2xl font-semibold text-[#09275f]">
              {locale === "zh" ? "全部动态" : "All updates"}
            </h2>
            <span className="text-sm text-[#66758f]">{items.length}</span>
          </div>
          {rest.length ? (
            rest.map((item: any) =>
              item.link ? (
                <Link
                  href={normalizeInternalHref(item.link.href)}
                  key={item.id}
                >
                  <NewsRow item={item} locale={locale} />
                </Link>
              ) : (
                <NewsRow item={item} key={item.id} locale={locale} />
              ),
            )
          ) : !featured ? (
            <p className="rounded-xl border border-[#e4eaf2] bg-white p-8 text-[#66758f]">
              {locale === "zh" ? "暂无公开动态" : "No public updates available"}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
