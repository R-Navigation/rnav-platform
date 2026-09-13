"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  getLocalizedText,
  isExternalHref,
  normalizeInternalHref,
  type Locale,
} from "../i18n";
import { sanitizePublicUrl } from "../url-sanitizer";

export function Icon({
  name,
  className = "h-5 w-5",
}: {
  name: "arrow" | "search" | "menu" | "close" | "external";
  className?: string;
}) {
  const paths = {
    arrow: (
      <>
        <path d="M5 12h14" />
        <path d="m13 6 6 6-6 6" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    menu: (
      <>
        <path d="M4 7h16M4 12h16M4 17h16" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    external: (
      <>
        <path d="M14 5h5v5M19 5l-8 8" />
        <path d="M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      {paths[name]}
    </svg>
  );
}

export function PublicButton({
  href,
  children,
  variant = "primary",
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
}) {
  const safeHref = normalizeInternalHref(href);
  const styles =
    variant === "primary"
      ? "bg-[#09275f] text-white hover:bg-[#1266f1]"
      : variant === "secondary"
        ? "border border-[#09275f] bg-white text-[#09275f] hover:border-[#1266f1] hover:text-[#1266f1]"
        : "text-[#09275f] hover:text-[#1266f1]";
  const content = (
    <>
      {children}
      <Icon className="h-4 w-4" name="arrow" />
    </>
  );
  const classes = `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold ${styles} ${className}`;
  return isExternalHref(safeHref) ? (
    <a
      className={classes}
      href={safeHref}
      rel="noopener noreferrer"
      target="_blank"
    >
      {content}
    </a>
  ) : (
    <Link className={classes} href={safeHref}>
      {content}
    </Link>
  );
}

export function PublicSectionHeading({
  eyebrow,
  title,
  description,
  href,
  linkLabel,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-3xl">
        <span className="public-kicker">{eyebrow}</span>
        <h2 className="mt-2 text-3xl font-semibold tracking-[-0.025em] text-[#09275f] sm:text-4xl">
          {title}
        </h2>
        {description ? (
          <p className="mt-3 max-w-2xl leading-7 text-[#66758f]">
            {description}
          </p>
        ) : null}
      </div>
      {href && linkLabel ? (
        <PublicButton
          className="self-start !px-0 sm:self-auto"
          href={href}
          variant="ghost"
        >
          {linkLabel}
        </PublicButton>
      ) : null}
    </div>
  );
}

export function PublicTag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-full border border-[#dbe6f2] bg-[#f4f8fc] px-2.5 py-1 text-xs font-semibold text-[#42617f]">
      {children}
    </span>
  );
}

export function PublicImage({
  image,
  alt,
  className = "aspect-[4/3]",
  eager = false,
}: {
  image: any;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  const src = sanitizePublicUrl(image?.src);
  return src ? (
    <div className={`overflow-hidden bg-[#eaf0f6] ${className}`}>
      <img
        alt={image?.alt || alt}
        className="h-full w-full object-cover"
        fetchPriority={eager ? "high" : "auto"}
        loading={eager ? "eager" : "lazy"}
        src={src}
      />
    </div>
  ) : (
    <div
      aria-hidden="true"
      className={`grid place-items-center bg-[linear-gradient(135deg,#eaf1f8,#f8fbfd)] text-sm font-semibold text-[#8494a8] ${className}`}
    >
      R·NAV
    </div>
  );
}

export function PublicationCard({
  item,
  locale,
  compact = false,
  fallback = "",
}: {
  item: any;
  locale: Locale;
  compact?: boolean;
  fallback?: string;
}) {
  const pdf = sanitizePublicUrl(item.pdf?.src);
  return (
    <article
      className={`group flex h-full flex-col overflow-hidden rounded-xl border border-[#e4eaf2] bg-white ${compact ? "p-5" : "sm:grid sm:grid-cols-[180px_1fr]"}`}
    >
      {!compact ? (
        <PublicImage
          alt={getLocalizedText(item.title, locale)}
          className="min-h-40"
          image={item.image}
        />
      ) : null}
      <div className={compact ? "" : "p-5 sm:p-6"}>
        <div className="flex flex-wrap gap-2">
          <PublicTag>
            {[item.year, getLocalizedText(item.venue, locale)]
              .filter(Boolean)
              .join(" · ") || fallback}
          </PublicTag>
        </div>
        <h3 className="mt-4 text-lg font-semibold leading-7 text-[#09275f] group-hover:text-[#1266f1]">
          {getLocalizedText(item.title, locale)}
        </h3>
        <p className="mt-3 text-sm leading-6 text-[#66758f]">
          {(item.authors ?? [])
            .map((author: any) => getLocalizedText(author.name, locale))
            .filter(Boolean)
            .join(", ")}
        </p>
        {pdf ? (
          <a
            className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#1266f1]"
            href={pdf}
            rel="noopener noreferrer"
            target="_blank"
          >
            {getLocalizedText(item.pdf?.label, locale) || "PDF"}
            <Icon className="h-4 w-4" name="external" />
          </a>
        ) : null}
      </div>
    </article>
  );
}

export function FacilityCard({ item, locale }: { item: any; locale: Locale }) {
  return (
    <article className="group overflow-hidden rounded-xl border border-[#e4eaf2] bg-white shadow-[0_12px_35px_rgba(9,39,95,.05)]">
      <PublicImage
        alt={getLocalizedText(item.title, locale)}
        className="aspect-video"
        image={item.image}
      />
      <div className="p-5 sm:p-6">
        {getLocalizedText(item.tag, locale) ? (
          <span className="public-kicker">
            {getLocalizedText(item.tag, locale)}
          </span>
        ) : null}
        <h3 className="mt-2 text-xl font-semibold text-[#09275f] group-hover:text-[#1266f1]">
          {getLocalizedText(item.title, locale)}
        </h3>
        <p className="mt-3 text-sm leading-6 text-[#66758f]">
          {getLocalizedText(item.description, locale) ||
            getLocalizedText(item.specLine, locale)}
        </p>
        {item.tags?.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {item.tags.slice(0, 4).map((tag: string) => (
              <PublicTag key={tag}>{tag}</PublicTag>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function MemberCard({
  member,
  locale,
}: {
  member: any;
  locale: Locale;
}) {
  const name = getLocalizedText(member.name, locale);
  return (
    <Link
      className="group block min-w-[230px] overflow-hidden rounded-xl border border-[#e4eaf2] bg-white"
      href={`/team#${encodeURIComponent(member.slug)}`}
    >
      <PublicImage alt={name} className="aspect-[4/3]" image={member.image} />
      <div className="p-4">
        <h3 className="font-semibold text-[#09275f] group-hover:text-[#1266f1]">
          {name}
        </h3>
        <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#66758f]">
          {getLocalizedText(member.research, locale) ||
            getLocalizedText(member.focus, locale) ||
            getLocalizedText(member.degree, locale)}
        </p>
      </div>
    </Link>
  );
}

export function NewsRow({ item, locale }: { item: any; locale: Locale }) {
  return (
    <article className="grid gap-3 border-b border-[#e4eaf2] py-5 sm:grid-cols-[120px_1fr]">
      <time className="text-sm font-medium text-[#66758f]">
        {getLocalizedText(item.date, locale)}
      </time>
      <div>
        <h3 className="font-semibold text-[#09275f]">
          {getLocalizedText(item.title, locale)}
        </h3>
        <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#66758f]">
          {getLocalizedText(item.excerpt, locale) ||
            getLocalizedText(item.description, locale)}
        </p>
      </div>
    </article>
  );
}

export function PublicSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="relative block w-full sm:w-80">
      <span className="sr-only">{placeholder}</span>
      <Icon
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#66758f]"
        name="search"
      />
      <input
        className="min-h-11 w-full rounded-lg border border-[#dbe3ed] bg-white py-2.5 pl-10 pr-4 text-sm text-[#0b1f45] placeholder:text-[#8494a8] focus:border-[#1266f1]"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={value}
      />
    </label>
  );
}

export function PageHero({
  header,
  locale,
  image,
}: {
  header: any;
  locale: Locale;
  image?: any;
}) {
  const hasImage = Boolean(sanitizePublicUrl(image?.src));
  return (
    <section className="border-b border-[#e4eaf2] bg-white">
      <div
        className={`public-container grid items-center gap-8 py-12 sm:py-16 ${hasImage ? "lg:grid-cols-[1.05fr_.95fr]" : ""}`}
      >
        <div className="max-w-3xl">
          <span className="public-kicker">
            {getLocalizedText(header?.eyebrow, locale)}
          </span>
          <h1 className="public-title mt-4">
            {getLocalizedText(header?.title, locale)}
          </h1>
          <p className="public-copy mt-5 max-w-2xl">
            {getLocalizedText(header?.description, locale)}
          </p>
        </div>
        {hasImage ? (
          <PublicImage
            alt={getLocalizedText(header?.title, locale)}
            className="aspect-[16/7] rounded-xl lg:aspect-[16/9]"
            eager
            image={image}
          />
        ) : null}
      </div>
    </section>
  );
}
