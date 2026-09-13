"use client";

import { PageHeader } from "./PageHeader";
import { useLanguage } from "./LanguageProvider";
import { getLocalizedText } from "./i18n";
import { PublicImage, PublicTag } from "./ui/PublicUi";
import { sanitizeActionUrl } from "./url-sanitizer";

export function ContactPage({ data }: { data: any }) {
  const { locale } = useLanguage();
  return (
    <main>
      <PageHeader header={data.header} image={data.heroImage} />
      <div className="public-container public-section">
        <section className="grid overflow-hidden rounded-2xl border border-[#e4eaf2] bg-white shadow-[0_16px_45px_rgba(9,39,95,.06)] lg:grid-cols-[1.05fr_.95fr]">
          <div className="p-7 sm:p-10 lg:p-12">
            <span className="public-kicker">
              {getLocalizedText(data.sectionTitles?.channels, locale)}
            </span>
            <p className="mt-5 max-w-xl leading-7 text-[#66758f]">
              {getLocalizedText(data.introText, locale)}
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {(data.primaryChannels ?? []).map((item: any, index: number) => {
                const href = sanitizeActionUrl(item.href);
                const content = (
                  <>
                    <h2 className="text-sm font-semibold text-[#09275f]">
                      {getLocalizedText(item.title, locale)}
                    </h2>
                    <p className="mt-2 break-all text-sm leading-6 text-[#66758f]">
                      {getLocalizedText(item.value, locale)}
                    </p>
                  </>
                );
                return href ? (
                  <a
                    className="min-h-28 rounded-xl border border-[#e4eaf2] bg-[#f7fafc] p-5 hover:border-[#1266f1]"
                    href={href}
                    key={index}
                  >
                    {content}
                  </a>
                ) : (
                  <article
                    className="min-h-28 rounded-xl border border-[#e4eaf2] bg-[#f7fafc] p-5"
                    key={index}
                  >
                    {content}
                  </article>
                );
              })}
            </div>
            {data.socialLinks?.length ? (
              <div className="mt-8 border-t border-[#e4eaf2] pt-6">
                <h2 className="text-sm font-semibold text-[#09275f]">
                  {getLocalizedText(data.sectionTitles?.social, locale)}
                </h2>
                <div className="mt-4 flex flex-wrap gap-3">
                  {data.socialLinks.map((item: any, index: number) => {
                    const href = sanitizeActionUrl(item.href);
                    return href ? (
                      <a href={href} key={index}>
                        <PublicTag>
                          {getLocalizedText(item.label, locale)} ·{" "}
                          {getLocalizedText(item.handle, locale)}
                        </PublicTag>
                      </a>
                    ) : null;
                  })}
                </div>
              </div>
            ) : null}
          </div>
          <PublicImage
            alt={getLocalizedText(data.header?.title, locale)}
            className="min-h-[360px] lg:min-h-full"
            image={data.heroImage}
          />
        </section>
        {data.extraCards?.length ? (
          <section className="mt-6 grid gap-5 md:grid-cols-2">
            {data.extraCards.map((item: any, index: number) => (
              <article
                className="rounded-xl border border-[#e4eaf2] bg-white p-6"
                key={index}
              >
                <h2 className="text-xl font-semibold text-[#09275f]">
                  {getLocalizedText(item.title, locale)}
                </h2>
                <p className="mt-3 leading-7 text-[#66758f]">
                  {getLocalizedText(item.description, locale)}
                </p>
                <p className="mt-4 font-semibold text-[#1266f1]">
                  {getLocalizedText(item.value, locale)}
                </p>
              </article>
            ))}
          </section>
        ) : null}
      </div>
    </main>
  );
}
