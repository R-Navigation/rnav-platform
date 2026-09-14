"use client";
import Image from "next/image";
import { RNAV_BRAND_ASSETS } from "@/lib/brand";
import { getLocalizedText, type Locale } from "../i18n";
import { sanitizeActionUrl } from "../url-sanitizer";
export function Footer({ site, locale }: { site: any; locale: Locale }) {
  return (
    <footer className="v41-footer">
      <div className="v41-wrap v41-footer-main">
        <a className="v41-footer-brand" href="/">
          <Image
            alt="RNAV — Resilient Navigation"
            className="v41-footer-lockup"
            height={50}
            src={RNAV_BRAND_ASSETS.horizontal}
            unoptimized
            width={128}
          />
          <span className="sr-only">{getLocalizedText(site.brand?.name, locale)}</span>
        </a>
        <div className="v41-footer-contacts">
          {(site.publicContacts ?? [])
            .filter((item: any) =>
              /^(mailto:|tel:|https?:)/.test(item.href ?? ""),
            )
            .slice(0, 2)
            .map((item: any, index: number) => (
              <a href={sanitizeActionUrl(item.href)} key={index}>
                {getLocalizedText(item.value, locale) ||
                  getLocalizedText(item.title, locale)}
              </a>
            ))}
          <nav>
            {(site.footer?.links ?? []).map(
              (link: any, index: number) =>
                sanitizeActionUrl(link.href) && (
                  <a href={sanitizeActionUrl(link.href)} key={index}>
                    {getLocalizedText(link.label, locale)}
                  </a>
                ),
            )}
            <a href="/login">
              {locale === "zh" ? "成员登录" : "Member sign in"}
            </a>
          </nav>
        </div>
        <p className="v41-footer-motto">
          {getLocalizedText(site.footer?.description, locale)}
        </p>
      </div>
      <p className="v41-wrap v41-copyright">
        {getLocalizedText(site.footer?.copyright, locale)}
      </p>
    </footer>
  );
}
