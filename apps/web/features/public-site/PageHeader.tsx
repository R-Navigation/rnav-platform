"use client";

import { useLanguage } from "./LanguageProvider";
import { PageHero } from "./ui/PublicUi";

export function PageHeader({ header, image }: { header: any; image?: any }) {
  const { locale } = useLanguage();
  return <PageHero header={header} image={image} locale={locale} />;
}
