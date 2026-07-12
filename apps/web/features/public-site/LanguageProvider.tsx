"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Locale } from "./i18n";
import { resolveHydratedLocale } from "./locale-storage";

type LanguageValue = { locale: Locale; setLocale(locale: Locale): void };
const LanguageContext = createContext<LanguageValue | null>(null);

export function LanguageProvider({ children, initialLocale = "zh", hasLocaleCookie = false }: { children: ReactNode; initialLocale?: Locale; hasLocaleCookie?: boolean }) {
  const [locale, updateLocale] = useState<Locale>(initialLocale);
  useEffect(() => {
    const restored = resolveHydratedLocale(initialLocale, hasLocaleCookie, window.localStorage.getItem("rnav_locale"));
    updateLocale(restored);
    window.localStorage.setItem("rnav_locale", restored);
    document.cookie = `rnav_locale=${restored}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.documentElement.lang = restored === "zh" ? "zh-CN" : "en";
  }, [hasLocaleCookie, initialLocale]);
  const value = useMemo(() => ({
    locale,
    setLocale(next: Locale) {
      updateLocale(next);
      document.cookie = `rnav_locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
      window.localStorage.setItem("rnav_locale", next);
      document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
    }
  }), [locale]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
}
