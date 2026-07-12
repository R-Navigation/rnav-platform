"use client";

import { useLanguage } from "./LanguageProvider";
import { getLocalizedText } from "./i18n";

export function PageHeader({ header }: { header: any }) {
  const { locale } = useLanguage();
  return <header className="mb-16 max-w-3xl"><span className="public-kicker mb-4 block">{getLocalizedText(header?.eyebrow, locale)}</span><h1 className="public-title mb-6">{getLocalizedText(header?.title, locale)}</h1><p className="public-copy">{getLocalizedText(header?.description, locale)}</p></header>;
}
