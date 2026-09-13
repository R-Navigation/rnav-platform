import { cookies } from "next/headers";
import {
  fallbackBootstrap,
  getOptionalPublicData,
  type PublicDataResult,
} from "./data";
import { PublicSiteLayout } from "./PublicSiteLayout";
import type { Locale } from "./i18n";

export async function PublicPage({
  bootstrap,
  degraded = false,
  children,
}: {
  bootstrap: PublicDataResult<typeof fallbackBootstrap>;
  degraded?: boolean;
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get("rnav_locale")?.value;
  const initialLocale: Locale = localeCookie === "en" ? "en" : "zh";
  const contact = await getOptionalPublicData("/api/public/contact");
  const publicContacts =
    contact &&
    typeof contact === "object" &&
    "primaryChannels" in contact &&
    Array.isArray(contact.primaryChannels)
      ? contact.primaryChannels
      : [];
  return (
    <PublicSiteLayout
      site={{ ...bootstrap.data, publicContacts }}
      initialLocale={initialLocale}
      hasLocaleCookie={localeCookie === "zh" || localeCookie === "en"}
      degraded={degraded || bootstrap.degraded}
    >
      {children}
    </PublicSiteLayout>
  );
}
