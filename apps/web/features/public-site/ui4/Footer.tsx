"use client";
import { getLocalizedText, type Locale } from "../i18n";
import { sanitizeActionUrl } from "../url-sanitizer";
export function Footer({ site, locale }: { site: any; locale: Locale }) {
  return (
    <footer className="v41-footer">
      <div className="v41-wrap v41-footer-main">
        <a className="v41-footer-brand" href="/">
          <span className="v41-wordmark">
            R<span>NAV</span>
          </span>
          <strong>{getLocalizedText(site.brand?.name, locale)}</strong>
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
