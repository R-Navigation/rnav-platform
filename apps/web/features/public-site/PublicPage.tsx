import { cookies } from "next/headers";
import { fallbackBootstrap, getPublicData } from "./data";
import { PublicSiteLayout } from "./PublicSiteLayout";
import type { Locale } from "./i18n";

export async function PublicPage({ children }: { children: React.ReactNode }) {
  const [site, cookieStore] = await Promise.all([getPublicData("bootstrap", fallbackBootstrap), cookies()]);
  const localeCookie = cookieStore.get("rnav_locale")?.value;
  const initialLocale: Locale = localeCookie === "en" ? "en" : "zh";
  return <PublicSiteLayout site={site} initialLocale={initialLocale} hasLocaleCookie={localeCookie === "zh" || localeCookie === "en"}>{children}</PublicSiteLayout>;
}
