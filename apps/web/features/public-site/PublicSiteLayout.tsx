"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { RNAV_BRAND_ASSETS } from "@/lib/brand";
import { LanguageProvider, useLanguage } from "./LanguageProvider";
import { getLocalizedText, normalizeInternalHref, type Locale } from "./i18n";
import { Icon } from "./ui/PublicUi";
import { Footer } from "./ui4/Footer";
import { publicNavigation } from "./ui4/navigation";
import "./ui4/public.css";

function Chrome({
  site,
  degraded,
  children,
}: {
  site: any;
  degraded: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { locale, setLocale } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigation = Array.isArray(site.navigation) && site.navigation.length ? site.navigation : publicNavigation;
  const filteredNavigation = navigation.filter((item: any) =>
    getLocalizedText(item.label, locale)
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setSearchOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="public-site min-h-screen">
      <header className="sticky top-0 z-50 border-b border-[#e4eaf2] bg-white/95 backdrop-blur-xl">
        <div className="v41-wrap v41-nav-row flex h-16 items-center justify-between gap-4 sm:h-[72px]">
          <Link
            className="flex min-w-0 items-center gap-3"
            href="/"
            onClick={() => setMenuOpen(false)}
          >
            <Image
              alt={site.brand?.mark?.alt || "RNAV"}
              className="v41-header-mark"
              height={36}
              src={site.brand?.mark?.src || RNAV_BRAND_ASSETS.mark}
              unoptimized
              width={site.brand?.mark?.src ? 96 : 41}
            />
            <span className="v41-brand-name">
              <strong>{site.brand?.name?.en === "R-Nav Robotics Navigation Lab" ? "Resilient Navigation" : site.brand?.name?.en || "Resilient Navigation"}</strong>
              <span>{site.brand?.name?.zh === "R-Nav 砺行导航·机器人实验室" ? "砺行导航·机器人实验室" : site.brand?.name?.zh || "砺行导航·机器人实验室"}</span>
            </span>
          </Link>
          <nav
            className="hidden h-full items-center gap-5 lg:flex"
            aria-label={locale === "zh" ? "主导航" : "Primary navigation"}
          >
            {navigation.map((item: any) => {
              const href = normalizeInternalHref(item.href);
              const active =
                href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={`relative flex h-full items-center text-sm font-semibold ${active ? "text-[#09275f] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[#1266f1]" : "text-[#66758f] hover:text-[#1266f1]"}`}
                  href={href}
                  key={item.key}
                >
                  {getLocalizedText(item.label, locale)}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              aria-expanded={searchOpen}
              aria-label={locale === "zh" ? "搜索导航" : "Search navigation"}
              className="grid h-11 w-11 place-items-center rounded-lg text-[#66758f] hover:bg-[#f4f8fc] hover:text-[#1266f1]"
              onClick={() => setSearchOpen((value) => !value)}
              type="button"
            >
              <Icon name="search" />
            </button>
            <div
              aria-label={locale === "zh" ? "语言" : "Language"}
              className="flex items-center"
            >
              {(["en", "zh"] as Locale[]).map((item, index) => (
                <span className="flex items-center" key={item}>
                  {index ? (
                    <span aria-hidden="true" className="text-[#c8d2df]">
                      |
                    </span>
                  ) : null}
                  <button
                    aria-pressed={locale === item}
                    className={`min-h-11 min-w-11 px-2 text-xs font-bold ${locale === item ? "text-[#09275f]" : "text-[#61728a] hover:text-[#1266f1]"}`}
                    onClick={() => setLocale(item)}
                    type="button"
                  >
                    {item === "zh" ? "中文" : "EN"}
                  </button>
                </span>
              ))}
            </div>
            <Link
              className="hidden min-h-11 items-center px-2 text-sm font-semibold text-[#66758f] hover:text-[#1266f1] xl:flex"
              href="/login"
            >
              {locale === "zh" ? "登录" : "Sign in"}
            </Link>
            <button
              aria-expanded={menuOpen}
              aria-label={locale === "zh" ? "打开导航" : "Open navigation"}
              className="grid h-11 w-11 place-items-center rounded-lg text-[#09275f] hover:bg-[#f4f8fc] lg:hidden"
              onClick={() => setMenuOpen((value) => !value)}
              type="button"
            >
              <Icon name={menuOpen ? "close" : "menu"} />
            </button>
          </div>
        </div>
        {searchOpen ? (
          <div className="border-t border-[#e4eaf2] bg-white">
            <div className="public-container py-4">
              <label className="relative block">
                <span className="sr-only">
                  {locale === "zh" ? "搜索页面" : "Search pages"}
                </span>
                <Icon
                  className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#66758f]"
                  name="search"
                />
                <input
                  autoFocus
                  className="min-h-12 w-full rounded-lg border border-[#dbe3ed] bg-[#f7fafc] py-3 pl-12 pr-4 text-sm"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={
                    locale === "zh" ? "搜索公开页面…" : "Search public pages…"
                  }
                  value={query}
                />
              </label>
              {query ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {filteredNavigation.map((item: any) => (
                    <Link
                      className="rounded-full border border-[#e4eaf2] px-3 py-2 text-sm text-[#09275f] hover:border-[#1266f1]"
                      href={normalizeInternalHref(item.href)}
                      key={item.key}
                      onClick={() => setSearchOpen(false)}
                    >
                      {getLocalizedText(item.label, locale)}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {menuOpen ? (
          <nav
            aria-label={locale === "zh" ? "移动端导航" : "Mobile navigation"}
            className="border-t border-[#e4eaf2] bg-white px-5 pb-5 pt-3 lg:hidden"
          >
            {navigation.map((item: any) => {
              const href = normalizeInternalHref(item.href);
              const active =
                href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={`block min-h-11 rounded-lg px-3 py-3 text-sm font-semibold ${active ? "bg-[#f4f8fc] text-[#1266f1]" : "text-[#415675]"}`}
                  href={href}
                  key={item.key}
                  onClick={() => setMenuOpen(false)}
                >
                  {getLocalizedText(item.label, locale)}
                </Link>
              );
            })}
            <div className="mt-3 flex items-center justify-between border-t border-[#e4eaf2] pt-4">
              <div className="flex items-center gap-2">
                {(["en", "zh"] as Locale[]).map((item) => (
                  <button
                    className={`min-h-11 rounded-lg px-3 text-sm font-semibold ${locale === item ? "bg-[#09275f] text-white" : "text-[#66758f]"}`}
                    key={item}
                    onClick={() => setLocale(item)}
                    type="button"
                  >
                    {item === "zh" ? "中文" : "EN"}
                  </button>
                ))}
              </div>
              <Link
                className="flex min-h-11 items-center text-sm font-semibold text-[#09275f]"
                href="/login"
              >
                {locale === "zh" ? "登录" : "Sign in"}
              </Link>
            </div>
          </nav>
        ) : null}
      </header>
      {degraded ? (
        <div
          className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-center text-sm text-amber-950"
          role="status"
        >
          {locale === "zh"
            ? "部分公开数据暂时不可用，当前显示备用内容。"
            : "Some public data is temporarily unavailable. Fallback content is shown."}
        </div>
      ) : null}
      {children}
      <Footer site={site} locale={locale} />
    </div>
  );
}

export function PublicSiteLayout({
  site,
  initialLocale,
  hasLocaleCookie,
  degraded,
  children,
}: {
  site: any;
  initialLocale: Locale;
  hasLocaleCookie: boolean;
  degraded: boolean;
  children: ReactNode;
}) {
  return (
    <LanguageProvider
      hasLocaleCookie={hasLocaleCookie}
      initialLocale={initialLocale}
    >
      <Chrome degraded={degraded} site={site}>
        {children}
      </Chrome>
    </LanguageProvider>
  );
}
