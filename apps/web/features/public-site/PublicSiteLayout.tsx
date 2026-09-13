"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LanguageProvider, useLanguage } from "./LanguageProvider";
import { getLocalizedText, normalizeInternalHref, type Locale } from "./i18n";
import { Icon } from "./ui/PublicUi";
import { sanitizePublicUrl } from "./url-sanitizer";

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
  const navigation = site.navigation ?? [];
  const brand = getLocalizedText(site.brand?.name, locale) || "R·NAV";
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
        <div className="public-container flex h-16 items-center justify-between gap-4 sm:h-[72px]">
          <Link
            className="flex min-w-0 items-center gap-3"
            href="/"
            onClick={() => setMenuOpen(false)}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#09275f] text-xs font-black tracking-tight text-white">
              R·N
            </span>
            <span className="truncate text-base font-bold tracking-[-0.02em] text-[#09275f] sm:text-lg">
              {brand}
            </span>
          </Link>
          <nav
            className="hidden h-full items-center gap-6 lg:flex"
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
              className="hidden items-center rounded-lg border border-[#e4eaf2] p-1 sm:flex"
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
                    className={`min-h-9 px-2 text-xs font-bold ${locale === item ? "text-[#09275f]" : "text-[#8494a8] hover:text-[#1266f1]"}`}
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
      <footer className="mt-16 border-t border-[#e4eaf2] bg-white">
        <div className="public-container grid gap-10 py-12 md:grid-cols-[1.3fr_.8fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#09275f] text-xs font-black text-white">
                R·N
              </span>
              <span className="font-bold text-[#09275f]">{brand}</span>
            </div>
            <p className="mt-4 max-w-md text-sm leading-6 text-[#66758f]">
              {getLocalizedText(site.footer?.description, locale)}
            </p>
          </div>
          <nav aria-label={locale === "zh" ? "页脚导航" : "Footer navigation"}>
            <h2 className="text-xs font-bold uppercase tracking-[.14em] text-[#09275f]">
              {locale === "zh" ? "快速访问" : "Explore"}
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
              {navigation.slice(0, 6).map((item: any) => (
                <Link
                  className="text-sm text-[#66758f] hover:text-[#1266f1]"
                  href={normalizeInternalHref(item.href)}
                  key={item.key}
                >
                  {getLocalizedText(item.label, locale)}
                </Link>
              ))}
            </div>
          </nav>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-[.14em] text-[#09275f]">
              {locale === "zh" ? "相关链接" : "Links"}
            </h2>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-3">
              {(site.footer?.links ?? []).map((link: any, index: number) => {
                const href = sanitizePublicUrl(link.href);
                return href ? (
                  <a
                    className="text-sm text-[#66758f] hover:text-[#1266f1]"
                    href={href}
                    key={index}
                    rel={
                      href.startsWith("http")
                        ? "noopener noreferrer"
                        : undefined
                    }
                    target={href.startsWith("http") ? "_blank" : undefined}
                  >
                    {getLocalizedText(link.label, locale)}
                  </a>
                ) : null;
              })}
            </div>
          </div>
        </div>
        <div className="border-t border-[#e4eaf2]">
          <div className="public-container py-5 text-xs leading-5 text-[#8494a8]">
            {getLocalizedText(site.footer?.copyright, locale)}
          </div>
        </div>
      </footer>
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
