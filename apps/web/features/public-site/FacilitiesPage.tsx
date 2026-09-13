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
  Tag,
} from "./ui4/Primitives";
import { flattenFacilities, isDemoContent } from "./ui4/content";
import { sanitizeEmbedUrl, sanitizePublicUrl } from "./url-sanitizer";

export function FacilitiesPage({
  data,
  featuredIds = [],
}: {
  data: any;
  featuredIds?: unknown[];
}) {
  const { locale } = useLanguage(),
    zh = locale === "zh",
    text = (value: unknown) => getLocalizedText(value, locale);
  const sections = data.facilitySections ?? [],
    all = flattenFacilities(data),
    platforms = all.filter((item) => item.sectionKind !== "asset"),
    assets = all.filter((item) => item.sectionKind === "asset");
  const [selected, setSelected] = useState("");
  const featured: any =
    platforms.find((item) => item.displayKey === selected) ||
    platforms.find((item) => String(item.id) === String(featuredIds[0])) ||
    platforms[0];
  const overview = sections.filter((section: any) => section.kind !== "asset");
  const video = sections.find((section: any) =>
    (section.items?.length ? section.items : [section]).some((item: any) =>
      item.id
        ? String(item.id) === String(featured?.id)
        : text(item.title) === text(featured?.title),
    ),
  )?.video;
  const embed = sanitizeEmbedUrl(video?.embedUrl),
    videoUrl = sanitizePublicUrl(video?.url);
  const configuredScenarios = Array.isArray(data.scenarios)
    ? data.scenarios
    : platforms;
  return (
    <main>
      <Hero
        variant="featureShowcase"
        header={{
          ...data.header,
          eyebrow: "EXPERIMENTAL PLATFORMS",
          description: isDemoContent(data.header)
            ? {
                zh: "了解实验室公开的机器人平台、核心设备与实验配置。",
                en: "Explore the lab’s publicly shared robotic platforms, equipment and experimental configurations.",
              }
            : data.header?.description,
        }}
        locale={locale}
        image={featured?.image}
        focalPosition={[70, 52]}
        mobileFocalPosition={[64, 50]}
        floating={
          <div className="v42-platform-summary">
            <span>{zh ? "平台概览" : "Platform overview"}</span>
            <strong>{platforms.length}</strong>
            <small>
              {zh
                ? `${overview.length} 类实验平台 · ${assets.length} 项公开设备`
                : `${overview.length} platform groups · ${assets.length} public assets`}
            </small>
          </div>
        }
      >
        <Action href="#platform-overview">
          {zh ? "了解实验平台" : "Explore platforms"}
        </Action>
        {(embed || videoUrl) && (
          <Action href="#platform-video" secondary>
            {zh ? "观看平台影像" : "Platform video"}
          </Action>
        )}
      </Hero>
      <section id="platform-overview" className="v41-wrap v41-section">
        <Heading
          title={zh ? "平台总览" : "Platform overview"}
          eyebrow="PLATFORM OVERVIEW"
        />
        <div className="v41-platform-overview">
          {overview.map((section: any, index: number) => {
            const first = section.items?.[0] || section;
            const match = platforms.find((item) =>
              first.id
                ? String(item.id) === String(first.id)
                : text(item.title) === text(first.title),
            );
            return (
              <button
                type="button"
                aria-pressed={featured?.displayKey === match?.displayKey}
                key={section.category || index}
                onClick={() => setSelected(match?.displayKey || "")}
              >
                <Media image={first.image} alt={text(first.title)} />
                <div>
                  <h3>
                    {text(section.subtitle) ||
                      text(first.categoryLabel) ||
                      text(first.title)}
                  </h3>
                  <p>{text(first.title)}</p>
                  <span>{zh ? "查看平台" : "View platform"} →</span>
                </div>
              </button>
            );
          })}
        </div>
        {!platforms.length && (
          <Empty>{zh ? "暂无公开平台" : "No public platforms yet"}</Empty>
        )}
      </section>
      <section className="v41-band">
        <div className="v41-wrap v41-section">
          <Heading
            title={zh ? "重点平台展示" : "Featured platform"}
            eyebrow="FEATURED PLATFORM"
          />
          {featured ? (
            <article className="v41-featured-platform">
              <Media image={featured.image} alt={text(featured.title)} />
              <div className="v41-card-body">
                <h2>{text(featured.title)}</h2>
                <p className="v41-description">{text(featured.description)}</p>
                <div className="v41-tags">
                  {(featured.tags ?? [])
                    .filter((tag: unknown) => !isDemoContent({ title: tag }))
                    .map((tag: unknown, index: number) => (
                      <Tag key={index}>{text(tag)}</Tag>
                    ))}
                </div>
                {platforms.length > 1 && (
                  <label className="v41-platform-picker">
                    {zh ? "切换平台" : "Select platform"}
                    <select
                      value={featured.displayKey}
                      onChange={(event) => setSelected(event.target.value)}
                    >
                      {platforms.map((item) => (
                        <option value={item.displayKey} key={item.displayKey}>
                          {text(item.title)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <div className="v41-spec-panel">
                <h3>
                  {zh ? "典型配置与能力" : "Configuration and capabilities"}
                </h3>
                {featured.specs?.length ? (
                  <dl>
                    {featured.specs.map((spec: any, index: number) => (
                      <div key={index}>
                        <dt>{text(spec.label)}</dt>
                        <dd>{text(spec.value)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="v41-muted">
                    {zh
                      ? "暂无公开配置参数"
                      : "No public specifications available"}
                  </p>
                )}
              </div>
            </article>
          ) : (
            <Empty>
              {zh
                ? "平台公开资料发布后将在这里展示。"
                : "Platform profiles will appear here when published."}
            </Empty>
          )}
        </div>
      </section>
      <section className="v41-wrap v41-section v41-pair">
        <div>
          <Heading
            title={zh ? "核心设备" : "Core equipment"}
            eyebrow="CORE EQUIPMENT"
          />
          <div className="v41-equipment-grid">
            {assets.map((item) => (
              <article key={item.displayKey}>
                <Media image={item.image} alt={text(item.title)} />
                <h3>{text(item.title)}</h3>
                <p>{text(item.description)}</p>
                {item.specs?.length ? (
                  <details>
                    <summary>
                      {zh ? "公开参数" : "Public specifications"}
                    </summary>
                    <dl>
                      {item.specs.map((spec, index) => (
                        <div key={index}>
                          <dt>{text(spec.label)}</dt>
                          <dd>{text(spec.value)}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                ) : null}
              </article>
            ))}
          </div>
          {!assets.length && (
            <Empty>
              {zh
                ? "暂无独立公开的核心设备资料"
                : "No independently published equipment profiles yet"}
            </Empty>
          )}
        </div>
        <div>
          <Heading
            title={zh ? "主要配置" : "Core components"}
            eyebrow="CORE COMPONENTS"
          />
          <div className="v41-components">
            {(featured?.components ?? []).map(
              (component: any, index: number) => (
                <article key={index}>
                  <h3>{text(component.role) || text(component.deviceType)}</h3>
                  <p>
                    {[component.manufacturer, component.model]
                      .filter(Boolean)
                      .join(" ")}
                    {component.count > 1 ? ` × ${component.count}` : ""}
                  </p>
                </article>
              ),
            )}
          </div>
          {!featured?.components?.length && (
            <Empty>
              {zh
                ? "此平台尚未公开组件明细"
                : "Component details are not publicly available for this platform"}
            </Empty>
          )}
        </div>
      </section>
      {(embed || videoUrl) && (
        <section id="platform-video" className="v41-wrap v41-section">
          <Heading
            title={text(video?.title) || (zh ? "平台影像" : "Platform media")}
            eyebrow="PLATFORM MEDIA"
          />
          {embed ? (
            <iframe
              className="v41-video"
              src={embed}
              title={text(video?.title) || text(featured?.title)}
              loading="lazy"
              allow="fullscreen; picture-in-picture"
              sandbox="allow-scripts allow-same-origin allow-presentation"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <Action href={videoUrl}>{zh ? "观看视频" : "Watch video"}</Action>
          )}
        </section>
      )}
      <section className="v41-wrap v41-section">
        <Heading
          title={zh ? "典型实验用途" : "Experimental applications"}
          eyebrow="APPLICATION SCENARIOS"
        />
        <div className="v41-scenario-grid">
          {configuredScenarios.map((item: any, index: number) => (
            <article key={item.displayKey || index}>
              <Media image={item.image} alt={text(item.title)} />
              <div>
                <h3>{text(item.title)}</h3>
                <p>{text(item.description)}</p>
              </div>
            </article>
          ))}
        </div>
        {!configuredScenarios.length && (
          <Empty>
            {zh
              ? "暂无公开应用场景资料"
              : "No published application scenarios yet"}
          </Empty>
        )}
      </section>
      <ContactCta
        locale={locale}
        title={!isDemoContent(data.cta) ? data.cta?.title : undefined}
        description={
          !isDemoContent(data.cta) ? data.cta?.description : undefined
        }
      />
    </main>
  );
}
