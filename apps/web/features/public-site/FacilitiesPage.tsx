"use client";

import { PageHeader } from "./PageHeader";
import { useLanguage } from "./LanguageProvider";
import { getLocalizedText, normalizeInternalHref } from "./i18n";
import {
  PublicButton,
  PublicImage,
  PublicSectionHeading,
  PublicTag,
} from "./ui/PublicUi";
import { sanitizeEmbedUrl, sanitizePublicUrl } from "./url-sanitizer";

export function FacilitiesPage({ data }: { data: any }) {
  const { locale } = useLanguage();
  const sections = data.facilitySections ?? [];
  const firstImage = sections
    .flatMap((section: any) =>
      section.items?.length ? section.items : [section],
    )
    .find((item: any) => sanitizePublicUrl(item.image?.src))?.image;
  return (
    <main>
      <PageHeader header={data.header} image={firstImage} />
      <div className="public-container public-section">
        <section className="mb-16">
          <PublicSectionHeading
            eyebrow={locale === "zh" ? "平台概览" : "PLATFORM OVERVIEW"}
            title={
              locale === "zh" ? "真实实验能力一览" : "Experimental capabilities"
            }
          />
          <div className="flex gap-3 overflow-x-auto pb-2">
            {sections.map((section: any, index: number) => (
              <a
                className="min-w-48 rounded-xl border border-[#e4eaf2] bg-white p-4 hover:border-[#1266f1]"
                href={`#facility-${index}`}
                key={section.category || index}
              >
                <span className="public-kicker">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="mt-2 block font-semibold text-[#09275f]">
                  {getLocalizedText(section.subtitle, locale) ||
                    getLocalizedText(section.title, locale)}
                </span>
              </a>
            ))}
          </div>
        </section>
        <div className="space-y-20">
          {sections.map((section: any, index: number) => {
            const items = section.items?.length ? section.items : [section];
            const embedUrl = sanitizeEmbedUrl(section.video?.embedUrl);
            const posterSrc = sanitizePublicUrl(section.video?.poster?.src);
            return (
              <section id={`facility-${index}`} key={section.category || index}>
                <PublicSectionHeading
                  eyebrow={
                    section.kind === "platform"
                      ? locale === "zh"
                        ? "实验平台"
                        : "EXPERIMENTAL PLATFORMS"
                      : section.kind === "asset"
                        ? locale === "zh"
                          ? "核心设备"
                          : "CORE EQUIPMENT"
                        : ""
                  }
                  title={getLocalizedText(section.subtitle, locale)}
                />
                <div className="grid gap-6 lg:grid-cols-2">
                  {items.map((item: any, itemIndex: number) => (
                    <article
                      className="overflow-hidden rounded-xl border border-[#e4eaf2] bg-white"
                      key={String(item.id ?? itemIndex)}
                    >
                      <PublicImage
                        alt={getLocalizedText(item.title, locale)}
                        className="aspect-video"
                        image={item.image}
                      />
                      <div className="p-6">
                        {getLocalizedText(item.tag, locale) ? (
                          <span className="public-kicker">
                            {getLocalizedText(item.tag, locale)}
                          </span>
                        ) : null}
                        <h3 className="mt-3 text-2xl font-semibold text-[#09275f]">
                          {getLocalizedText(item.title, locale)}
                        </h3>
                        <p className="mt-3 leading-7 text-[#66758f]">
                          {getLocalizedText(item.description, locale)}
                        </p>
                        {item.tags?.length ? (
                          <div className="mt-5 flex flex-wrap gap-2">
                            {item.tags.map((tag: string) => (
                              <PublicTag key={tag}>{tag}</PublicTag>
                            ))}
                          </div>
                        ) : null}
                        {item.specs?.length ? (
                          <dl className="mt-6 divide-y divide-[#e4eaf2] border-t border-[#e4eaf2]">
                            {item.specs.map((spec: any, specIndex: number) => (
                              <div
                                className="grid grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] gap-4 py-3 text-sm"
                                key={specIndex}
                              >
                                <dt className="text-[#66758f]">
                                  {getLocalizedText(spec.label, locale)}
                                </dt>
                                <dd className="text-right font-medium text-[#09275f]">
                                  {getLocalizedText(spec.value, locale)}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        ) : null}
                        {item.components?.length ? (
                          <section className="mt-6 border-t border-[#e4eaf2] pt-5">
                            <h4 className="text-sm font-bold text-[#09275f]">
                              {locale === "zh" ? "主要配置" : "Core components"}
                            </h4>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              {item.components.map(
                                (component: any, componentIndex: number) => (
                                  <div
                                    className="rounded-lg bg-[#f4f8fc] p-3 text-sm"
                                    key={componentIndex}
                                  >
                                    <b className="text-[#09275f]">
                                      {getLocalizedText(
                                        component.role,
                                        locale,
                                      ) || component.deviceType}
                                    </b>
                                    <p className="mt-1 text-[#66758f]">
                                      {[component.manufacturer, component.model]
                                        .filter(Boolean)
                                        .join(" ")}
                                      {component.count > 1
                                        ? ` × ${component.count}`
                                        : ""}
                                    </p>
                                  </div>
                                ),
                              )}
                            </div>
                          </section>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
                {embedUrl ||
                posterSrc ||
                getLocalizedText(section.video?.title, locale) ? (
                  <article className="mt-6 overflow-hidden rounded-xl border border-[#e4eaf2] bg-white lg:grid lg:grid-cols-[1.4fr_.6fr]">
                    {embedUrl ? (
                      <iframe
                        allow="fullscreen; picture-in-picture"
                        className="min-h-[320px] w-full"
                        referrerPolicy="strict-origin-when-cross-origin"
                        sandbox="allow-scripts allow-same-origin allow-presentation"
                        src={embedUrl}
                        title={getLocalizedText(section.video.title, locale)}
                      />
                    ) : (
                      <PublicImage
                        alt={
                          section.video?.poster?.alt ||
                          getLocalizedText(section.video?.title, locale)
                        }
                        className="min-h-[280px]"
                        image={{
                          src: posterSrc,
                          alt: section.video?.poster?.alt,
                        }}
                      />
                    )}
                    <div className="p-6 lg:self-center">
                      <span className="public-kicker">
                        {locale === "zh" ? "平台影像" : "PLATFORM MEDIA"}
                      </span>
                      <h3 className="mt-3 text-xl font-semibold text-[#09275f]">
                        {getLocalizedText(section.video?.title, locale)}
                      </h3>
                      <p className="mt-3 text-sm leading-6 text-[#66758f]">
                        {getLocalizedText(section.video?.description, locale)}
                      </p>
                    </div>
                  </article>
                ) : null}
              </section>
            );
          })}
        </div>
        <section className="mt-20 rounded-2xl bg-[#09275f] p-7 text-white sm:flex sm:items-center sm:justify-between sm:p-10">
          <div>
            <h2 className="text-3xl font-semibold">
              {getLocalizedText(data.cta?.title, locale)}
            </h2>
            <p className="mt-3 max-w-2xl text-blue-100">
              {getLocalizedText(data.cta?.description, locale)}
            </p>
          </div>
          <PublicButton
            className="mt-6 !bg-white !text-[#09275f] sm:mt-0"
            href={normalizeInternalHref(data.cta?.buttonHref || "/contact")}
          >
            {getLocalizedText(data.cta?.buttonLabel, locale)}
          </PublicButton>
        </section>
      </div>
    </main>
  );
}
