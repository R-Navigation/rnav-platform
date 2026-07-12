import type { Locale } from "./i18n.ts";

export function resolveHydratedLocale(initialLocale: Locale, hasLocaleCookie: boolean, storedLocale: string | null): Locale {
  if (hasLocaleCookie) return initialLocale;
  return storedLocale === "en" || storedLocale === "zh" ? storedLocale : initialLocale;
}
