"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, type ReactNode } from "react";
import { getLocalizedText, type Locale } from "../i18n";
import { sanitizeActionUrl, sanitizePublicUrl } from "../url-sanitizer";
export { PublicTag as Tag, PublicSearch as Search } from "../ui/PublicUi";
export { Icon } from "./Icon";

export function Media({
  image,
  alt,
  className = "",
  eager = false,
  sizes = "(max-width: 767px) 90vw, (max-width: 1199px) 45vw, 33vw",
}: {
  image?: any;
  alt: string;
  className?: string;
  eager?: boolean;
  sizes?: string;
}) {
  const src = sanitizePublicUrl(image?.src);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return (
    <div className={`v41-media ${className}`}>
      {src && src !== failedSrc ? (
        <Image
          fill
          sizes={sizes}
          unoptimized={
            !src.startsWith("/") &&
            !/^https:\/\/(r-navigation-1326672316\.cos\.ap-beijing\.myqcloud\.com|liesmars\.whu\.edu\.cn)\//.test(
              src,
            )
          }
          src={src}
          loader={
            src.startsWith(
              "https://r-navigation-1326672316.cos.ap-beijing.myqcloud.com/",
            )
              ? ({ src, width }) =>
                  `/api/public/image?src=${encodeURIComponent(src)}&w=${width}`
              : undefined
          }
          onError={() => setFailedSrc(src)}
          alt={image?.alt || alt}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          style={{
            objectPosition: `${image?.positionX ?? 50}% ${image?.positionY ?? 50}%`,
            transform: `scale(${image?.zoom ?? 1})`,
            transformOrigin: `${image?.positionX ?? 50}% ${image?.positionY ?? 50}%`,
          }}
        />
      ) : (
        <span aria-hidden="true" className="v41-media-mark">
          R<span>NAV</span>
        </span>
      )}
    </div>
  );
}

export function Action({
  href,
  children,
  secondary = false,
}: {
  href: string;
  children: ReactNode;
  secondary?: boolean;
}) {
  const safe = sanitizeActionUrl(href);
  return safe && safe !== "#" ? (
    <a
      className={`v41-button ${secondary ? "v41-button-secondary" : ""}`}
      href={safe}
    >
      {children}
      <span aria-hidden="true">→</span>
    </a>
  ) : null;
}

export function Heading({
  title,
  eyebrow,
  href,
  action,
}: {
  title: string;
  eyebrow: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="v41-heading">
      <div>
        <h2>{title}</h2>
        <span>{eyebrow}</span>
      </div>
      {href ? (
        <Link href={href}>
          {action || "→"} <span aria-hidden="true">→</span>
        </Link>
      ) : null}
    </div>
  );
}

export function Hero({
  header,
  locale,
  image,
  children,
  home = false,
  media,
}: {
  header: any;
  locale: Locale;
  image?: any;
  children?: ReactNode;
  home?: boolean;
  media?: ReactNode;
}) {
  return (
    <section className={`v41-hero ${home ? "v41-home-hero" : ""}`}>
      <div className="v41-wrap v41-hero-grid">
        <div className="v41-hero-copy">
          <p className="v41-eyebrow">
            {getLocalizedText(header?.eyebrow, locale)}
          </p>
          <h1>
            {getLocalizedText(header?.title, locale)}
            {header?.highlight ? (
              <>
                {" "}
                <span>{getLocalizedText(header.highlight, locale)}</span>
              </>
            ) : null}
          </h1>
          <p className="v41-description">
            {getLocalizedText(header?.description, locale)}
          </p>
          {children ? <div className="v41-actions">{children}</div> : null}
        </div>
        {media || (
          <Media
            image={image}
            alt={getLocalizedText(header?.title, locale)}
            eager
            sizes="(max-width: 767px) 90vw, 55vw"
            className="v41-hero-media"
          />
        )}
      </div>
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="v41-empty">
      <span aria-hidden="true">—</span>
      <p>{children}</p>
    </div>
  );
}

export function ContactCta({
  locale,
  title,
  description,
}: {
  locale: Locale;
  title?: unknown;
  description?: unknown;
}) {
  return (
    <section className="v41-cta">
      <div className="v41-wrap">
        <div>
          <h2>
            {getLocalizedText(title, locale) ||
              (locale === "zh"
                ? "加入我们 · 共同探索"
                : "Join us · Explore together")}
          </h2>
          <p>{getLocalizedText(description, locale)}</p>
        </div>
        <Action href="/contact">
          {locale === "zh" ? "联系我们" : "Contact us"}
        </Action>
      </div>
    </section>
  );
}

export function Publication({
  item,
  locale,
  featured = false,
}: {
  item: any;
  locale: Locale;
  featured?: boolean;
}) {
  const links = [
    ...(item.pdf?.src
      ? [{ href: item.pdf.src, label: item.pdf.label || "PDF" }]
      : []),
    ...(item.links ?? []),
  ].filter((link) => sanitizePublicUrl(link.href) && link.href !== "#");
  return (
    <article className={`v41-paper ${featured ? "v41-paper-featured" : ""}`}>
      <Media image={item.image} alt={getLocalizedText(item.title, locale)} />
      <div>
        <p className="v41-eyebrow">
          {item.year} · {getLocalizedText(item.venue, locale)}
        </p>
        <h3>{getLocalizedText(item.title, locale)}</h3>
        <p className="v41-muted">
          {(item.authors ?? [])
            .map((author: any) => getLocalizedText(author.name, locale))
            .join(", ")}
        </p>
        {Array.isArray(item.keywords) && item.keywords.length ? (
          <div className="v41-tags">
            {item.keywords.slice(0, 5).map((tag: unknown, index: number) => (
              <span className="v41-keyword" key={index}>
                {getLocalizedText(tag, locale)}
              </span>
            ))}
          </div>
        ) : null}
        <div className="v41-link-row">
          {links.map((link, index) => (
            <a
              key={index}
              href={sanitizePublicUrl(link.href)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {getLocalizedText(link.label, locale)} ↗
            </a>
          ))}
        </div>
      </div>
    </article>
  );
}

export function Member({ member, locale }: { member: any; locale: Locale }) {
  const name = getLocalizedText(member.name, locale);
  return (
    <article id={member.slug} className="v41-member">
      <Media image={member.image} alt={name} />
      <div>
        <h3>{name}</h3>
        {locale === "zh" && member.name?.en ? (
          <p className="v41-english">{member.name.en}</p>
        ) : null}
        <p className="v41-identity">
          {[
            getLocalizedText(member.role, locale),
            getLocalizedText(member.degree, locale),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="v41-muted">
          {getLocalizedText(member.research, locale) ||
            getLocalizedText(member.focus, locale)}
        </p>
      </div>
    </article>
  );
}
