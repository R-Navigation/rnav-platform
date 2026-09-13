"use client";

import type { ReactNode } from "react";
import { getLocalizedText, type Locale } from "../i18n";
import { sanitizePublicUrl } from "../url-sanitizer";
import { isDemoContent } from "./content";
import "./member-card.css";

/** The public page and the unsaved console preview share this exact layout. */
export function MemberCard({
  member,
  locale,
  portrait,
}: {
  member: any;
  locale: Locale;
  portrait: ReactNode;
}) {
  const zh = locale === "zh",
    text = (value: unknown) => getLocalizedText(value, locale);
  const bio = !isDemoContent({ description: member.bio })
    ? text(member.bio)
    : "";
  const links = (member.links ?? []).filter(
    (link: any) => sanitizePublicUrl(link.href) && link.href !== "#",
  );
  const facts = [
    [zh ? "专业" : "Major", member.major],
    [zh ? "毕业年份" : "Graduation", member.graduation],
    [zh ? "毕业论文" : "Thesis", member.thesis],
    [zh ? "毕业去向" : "Destination", member.destination],
  ].filter(([, value]) => text(value));
  return (
    <article className="rnav-member-card" id={member.slug}>
      <div className="rnav-member-summary">
        <div className="rnav-member-portrait">{portrait}</div>
        <div className="rnav-member-copy">
          <h3>{text(member.name)}</h3>
          {zh && member.name?.en && (
            <p className="rnav-member-en">{member.name.en}</p>
          )}
          <p className="rnav-member-identity">
            {[
              text(member.degree) || text(member.role),
              text(member.enrollmentYear),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {(text(member.research) || text(member.focus)) && (
            <p className="rnav-member-research">
              {text(member.research) || text(member.focus)}
            </p>
          )}
        </div>
      </div>
      {bio || facts.length || links.length || member.contacts?.length ? (
        <details className="rnav-member-details">
          <summary>{zh ? "公开资料" : "Public profile"}</summary>
          {bio && <p>{bio}</p>}
          <dl>
            {facts.map(([label, value], index) => (
              <div key={index}>
                <dt>{String(label)}</dt>
                <dd>{text(value)}</dd>
              </div>
            ))}
          </dl>
          <div className="rnav-member-links">
            {links.map((link: any, index: number) => (
              <a
                key={index}
                href={sanitizePublicUrl(link.href)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {text(link.label) || (zh ? "个人主页" : "Website")} ↗
              </a>
            ))}
            {(member.contacts ?? []).map((contact: any, index: number) => (
              <p key={index}>
                {text(contact.label)} {text(contact.value)}
              </p>
            ))}
          </div>
        </details>
      ) : null}
    </article>
  );
}
