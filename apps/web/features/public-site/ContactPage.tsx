"use client";
import { useState } from "react";
import { useLanguage } from "./LanguageProvider";
import { getLocalizedText } from "./i18n";
import { Action, Heading, Hero, Icon, Media } from "./ui4/Primitives";
import { isDemoContent, publishedItems } from "./ui4/content";
import { sanitizeActionUrl } from "./url-sanitizer";

export function ContactPage({ data }: { data: any }) {
  const { locale } = useLanguage(),
    zh = locale === "zh",
    text = (value: unknown) => getLocalizedText(value, locale);
  const channels = publishedItems<any>(data.primaryChannels ?? []),
    social = publishedItems<any>(data.socialLinks ?? []);
  const address = channels.find(
      (item) =>
        item.icon === "location_on" ||
        /地址|location|address/i.test(text(item.title)),
    ),
    email = channels.find((item) => String(item.href).startsWith("mailto:"));
  const overview = channels.find((item) =>
    /研究概述|research overview/i.test(text(item.title)),
  );
  const [copyStatus, setCopyStatus] = useState("");
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus(zh ? "已复制" : "Copied");
    } catch {
      setCopyStatus(
        zh
          ? "复制失败，请选择文本复制"
          : "Copy failed. Please select and copy the text.",
      );
    }
  };
  // Official campus photograph, not a fabricated building or a replacement CMS record.
  const officialCampus = /武汉大学/.test(getLocalizedText(address?.value, "zh"))
    ? {
        src: "https://liesmars.whu.edu.cn/images/202501233.png",
        alt: zh
          ? "武汉大学校园风景，图片来自 LIESMARS 官网"
          : "Wuhan University campus landscape, from the LIESMARS website",
      }
    : undefined;
  const configuredImage = data.campusImage || data.heroImage;
  const image =
    configuredImage?.src &&
    !isDemoContent({
      title: configuredImage.alt,
      description: configuredImage.dataAlt,
    })
      ? configuredImage
      : officialCampus;
  const extras = publishedItems<any>(data.extraCards ?? []);
  const cards = extras.length
    ? extras
    : [
        {
          title: { zh: "合作交流", en: "Collaboration" },
          description: overview?.value || data.introText,
          href: email?.href,
          icon: "groups",
        },
        {
          title: { zh: "招生与加入", en: "Join our team" },
          description: data.header?.description,
          href: email?.href,
          icon: "school",
        },
        {
          title: { zh: "实验平台参观", en: "Lab visits" },
          description: {
            zh: "请通过公开联系方式咨询来访安排。",
            en: "Please contact us through the published channels to discuss a visit.",
          },
          href: email?.href,
          icon: "science",
        },
      ];
  return (
    <main>
      <Hero
        variant="fullBleed"
        header={{ ...data.header, eyebrow: "CONTACT US" }}
        locale={locale}
        image={image}
        focalPosition={[68, 48]}
        mobileFocalPosition={[64, 48]}
      />
      <section className="v41-wrap v41-section v41-contact-pair">
        <div id="contact-information" className="v41-contact-info">
          <Heading
            title={zh ? "联系信息" : "Contact information"}
            eyebrow="CONTACT INFORMATION"
          />
          <p className="v41-muted">{text(data.introText)}</p>
          <div className="v41-contact-channels">
            {channels
              .filter((item) => item !== overview)
              .map((item, index) => {
                const href = sanitizeActionUrl(item.href),
                  value = text(item.value);
                return (
                  <article key={index}>
                    <span className="v41-contact-icon">
                      <Icon name={item.icon || "mail"} />
                    </span>
                    <div>
                      <h2>{text(item.title)}</h2>
                      {href && href !== "#" ? (
                        <a href={href}>{value} ↗</a>
                      ) : (
                        <p>{value}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => copy(value)}
                      aria-label={
                        zh
                          ? `复制${text(item.title)}`
                          : `Copy ${text(item.title)}`
                      }
                    >
                      <Icon name="content_copy" />
                    </button>
                  </article>
                );
              })}
          </div>
          <div className="v41-socials">
            <h2>
              {text(data.sectionTitles?.social) ||
                (zh ? "关注我们" : "Follow us")}
            </h2>
            <div>
              {social.map((item, index) => {
                const href = sanitizeActionUrl(item.href),
                  label = `${text(item.label)} ${text(item.handle)}`;
                return href && href !== "#" ? (
                  <a
                    href={href}
                    key={index}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {label} ↗
                  </a>
                ) : (
                  <span key={index}>{label}</span>
                );
              })}
            </div>
          </div>
          <p className="v41-copy-status" role="status">
            {copyStatus}
          </p>
        </div>
        <figure className="v41-campus">
          <Media image={image} alt={zh ? "校园风景" : "Campus landscape"} />
          {image === officialCampus && (
            <figcaption>
              <a
                href="https://liesmars.whu.edu.cn/"
                target="_blank"
                rel="noopener noreferrer"
              >
                {zh
                  ? "校园风景 · 图片来源：LIESMARS 官网"
                  : "Campus landscape · Source: LIESMARS"}{" "}
                ↗
              </a>
            </figcaption>
          )}
        </figure>
      </section>
      <section className="v41-wrap v41-contact-cards">
        {cards.map((item, index) => (
          <article key={index}>
            <div className="v41-contact-card-title">
              <span className="v41-contact-icon">
                <Icon name={item.icon || "groups"} />
              </span>
              <h2>{text(item.title)}</h2>
            </div>
            <p>{text(item.description)}</p>
            {text(item.value) && <p>{text(item.value)}</p>}
            <Action href={item.href || email?.href || ""} secondary>
              {zh ? "取得联系" : "Get in touch"}
            </Action>
          </article>
        ))}
      </section>
      <section className="v41-wrap v41-section">
        <div className="v41-location">
          <div className="v41-card-body">
            <Heading
              title={zh ? "位置与交通" : "Location and travel"}
              eyebrow="LOCATION"
            />
            <p className="v41-location-address">
              {text(address?.value) ||
                (zh ? "暂无公开地址" : "No public address available")}
            </p>
            <p className="v41-description">
              {zh
                ? "通过地图查看准确位置和实时路线。校园入校及来访安排请提前联系确认。"
                : "Use the map for the exact location and current routes. Please contact us beforehand about campus access and visit arrangements."}
            </p>
            <Action href={address?.href || ""}>
              {zh ? "在地图中查看" : "Open location in map"}
            </Action>
          </div>
          <div className="v41-location-visual">
            <Media
              image={image}
              alt={
                zh
                  ? "校园风景，准确位置请查看地图"
                  : "Campus landscape. Open the map for the exact location."
              }
            />
          </div>
        </div>
      </section>
    </main>
  );
}
