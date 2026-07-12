"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { LanguageProvider, useLanguage } from "./LanguageProvider";
import { getLocalizedText, normalizeInternalHref, type Locale } from "./i18n";

function Chrome({ site, children }: { site: any; children: ReactNode }) {
  const pathname = usePathname();
  const { locale, setLocale } = useLanguage();
  const [open, setOpen] = useState(false);
  const navigation = site.navigation ?? [];
  return <div className="min-h-screen bg-surface text-on-surface">
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3 sm:px-6 lg:px-8">
        <Link className="font-serif text-xl font-bold text-primary" href="/">{getLocalizedText(site.brand?.name, locale)}</Link>
        <nav className="hidden items-center gap-6 lg:flex" aria-label="Primary navigation">
          {navigation.map((item: any) => { const href = normalizeInternalHref(item.href); const active = href === "/" ? pathname === "/" : pathname.startsWith(href); return <Link key={item.key} className={active ? "border-b-2 border-cyan-600 py-2 font-semibold text-cyan-700" : "py-2 text-slate-600 hover:text-cyan-700"} href={href}>{getLocalizedText(item.label, locale)}</Link>; })}
        </nav>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded border border-slate-300" aria-label="Language">
            {(["zh", "en"] as Locale[]).map((item) => <button key={item} type="button" onClick={() => setLocale(item)} className={locale === item ? "bg-primary px-3 py-2 text-xs font-semibold text-white" : "bg-white px-3 py-2 text-xs font-semibold text-slate-600"}>{item === "zh" ? "中" : "EN"}</button>)}
          </div>
          <Link className="hidden text-sm text-slate-500 hover:text-primary sm:block" href="/login">登录</Link>
          <button className="h-10 w-10 border border-slate-300 text-xl lg:hidden" type="button" aria-label="Toggle navigation" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? "×" : "☰"}</button>
        </div>
      </div>
      {open ? <nav className="border-t border-slate-200 bg-white px-5 py-3 lg:hidden">{navigation.map((item: any) => <Link onClick={() => setOpen(false)} className="block px-3 py-3 text-sm font-medium text-slate-700" key={item.key} href={normalizeInternalHref(item.href)}>{getLocalizedText(item.label, locale)}</Link>)}</nav> : null}
    </header>
    {children}
    <footer className="mt-20 border-t border-slate-200 bg-slate-50"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 px-5 py-12 sm:px-6 md:flex-row lg:px-8"><div><div className="font-serif text-lg font-semibold text-primary">{getLocalizedText(site.brand?.name, locale)}</div><p className="mt-2 text-sm text-slate-500">{getLocalizedText(site.footer?.copyright, locale)}</p><p className="mt-1 text-sm text-slate-500">{getLocalizedText(site.footer?.description, locale)}</p></div><div className="flex gap-6">{(site.footer?.links ?? []).map((link: any, index: number) => <a className="text-sm text-slate-500 underline" key={index} href={normalizeInternalHref(link.href)}>{getLocalizedText(link.label, locale)}</a>)}</div></div></footer>
  </div>;
}

export function PublicSiteLayout({ site, initialLocale, children }: { site: any; initialLocale: Locale; children: ReactNode }) {
  return <LanguageProvider initialLocale={initialLocale}><Chrome site={site}>{children}</Chrome></LanguageProvider>;
}
