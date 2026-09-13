"use client";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "./LanguageProvider";
import { getLocalizedText } from "./i18n";
import {
  Action,
  ContactCta,
  Heading,
  Hero,
  Media,
  Tag,
} from "./ui4/Primitives";
import { isDemoContent } from "./ui4/content";
import { sanitizePublicUrl } from "./url-sanitizer";

export function TeamPage({ data }: { data: any }) {
  const { locale } = useLanguage(),
    zh = locale === "zh",
    text = (value: unknown) => getLocalizedText(value, locale);
  const lead = data.facultyLead || data.advisors?.[0];
  const [photo, setPhoto] = useState<any>(null),
    dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (photo) dialog.current?.showModal();
  }, [photo]);
  useEffect(() => {
    const reveal = () => {
      let id = window.location.hash.slice(1);
      try {
        id = decodeURIComponent(id);
      } catch {
        return;
      }
      const element = document.getElementById(id);
      if (!element) return;
      let parent = element.parentElement;
      while (parent) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
        parent = parent.parentElement;
      }
      element.scrollIntoView({ block: "center" });
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);
  const groups = [
    { key: "faculty", en: "FACULTY", members: data.advisors ?? [] },
    {
      key: "postdocs",
      en: "POSTDOCTORAL FELLOWS",
      members: data.postdocs ?? [],
    },
    { key: "phd", en: "PHD STUDENTS", members: data.phdStudents ?? [] },
    {
      key: "master",
      en: "MASTER STUDENTS",
      members: data.masterStudents ?? [],
    },
    {
      key: "undergrad",
      en: "UNDERGRADUATE STUDENTS",
      members: data.undergraduateStudents ?? [],
    },
    { key: "alumni", en: "ALUMNI", members: data.alumni ?? [] },
  ];
  const portraits = groups
    .flatMap((group) => group.members)
    .filter((member: any) => member.image?.src)
    .slice(0, 3);
  const contacts = (member: any) => (
    <div className="v41-profile-links">
      {(member.links ?? [])
        .filter(
          (link: any) => sanitizePublicUrl(link.href) && link.href !== "#",
        )
        .map((link: any, index: number) => (
          <a
            href={sanitizePublicUrl(link.href)}
            key={`link-${index}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {text(link.label) || (zh ? "个人主页" : "Website")} ↗
          </a>
        ))}
      {(member.contacts ?? []).map((contact: any, index: number) => (
        <p key={index}>
          <span>{text(contact.label)}</span> {text(contact.value)}
        </p>
      ))}
    </div>
  );
  const portrait = (member: any, featured = false) =>
    sanitizePublicUrl(member.image?.src) ? (
      <button
        className={featured ? "v41-lead-photo" : "v41-person-photo"}
        type="button"
        aria-label={
          zh
            ? `查看${text(member.name)}的照片`
            : `View ${text(member.name)}’s photo`
        }
        onClick={() => setPhoto(member)}
      >
        <Media image={member.image} alt={text(member.name)} />
      </button>
    ) : (
      <Media className="v41-person-photo" alt={text(member.name)} />
    );
  const person = (member: any) => (
    <article
      className="v41-person"
      id={member.slug === lead?.slug ? `${member.slug}-card` : member.slug}
      key={member.slug}
    >
      <div className="v41-person-summary">
        {portrait(member)}
        <div>
          <h3>{text(member.name)}</h3>
          {zh && member.name?.en && (
            <p className="v41-person-en">{member.name.en}</p>
          )}
          <p className="v41-identity">
            {[
              text(member.degree) || text(member.role),
              text(member.enrollmentYear),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="v41-person-research">
            {text(member.research) || text(member.focus)}
          </p>
          {Array.isArray(member.tags) && (
            <div className="v41-tags">
              {member.tags.slice(0, 2).map((tag: unknown, index: number) => (
                <Tag key={index}>{text(tag)}</Tag>
              ))}
            </div>
          )}
        </div>
      </div>
      {member.links?.length ||
      member.contacts?.length ||
      text(member.major) ||
      text(member.graduation) ||
      text(member.thesis) ||
      text(member.destination) ||
      (!isDemoContent({ description: member.bio }) && text(member.bio)) ? (
        <details className="v41-person-details">
          <summary>{zh ? "公开资料" : "Public profile"}</summary>
          {!isDemoContent({ description: member.bio }) && (
            <p>{text(member.bio)}</p>
          )}
          <dl>
            {[
              [zh ? "专业" : "Major", member.major],
              [zh ? "毕业年份" : "Graduation", member.graduation],
              [zh ? "毕业论文" : "Thesis", member.thesis],
              [zh ? "毕业去向" : "Destination", member.destination],
            ]
              .filter(([, value]) => text(value))
              .map(([label, value], index) => (
                <div key={index}>
                  <dt>{String(label)}</dt>
                  <dd>{text(value)}</dd>
                </div>
              ))}
          </dl>
          {contacts(member)}
        </details>
      ) : null}
    </article>
  );
  const groupContent = (group: any) => (
    <>
      <div className="v41-group-people">
        {group.members.slice(0, 4).map(person)}
      </div>
      {group.members.length > 4 && (
        <details className="v41-group-more">
          <summary>
            {zh
              ? `查看其余 ${group.members.length - 4} 位成员`
              : `View ${group.members.length - 4} more members`}
          </summary>
          <div className="v41-group-people">
            {group.members.slice(4).map(person)}
          </div>
        </details>
      )}
    </>
  );
  return (
    <main>
      <Hero
        header={{
          ...data.header,
          title: { zh: "团队成员", en: "Our team" },
          eyebrow: "PEOPLE DRIVE RESEARCH",
        }}
        locale={locale}
        image={data.groupImage || data.header?.image}
        media={
          !(data.groupImage?.src || data.header?.image?.src) &&
          portraits.length ? (
            <div className="v41-team-mosaic">
              {portraits.map((member: any) => (
                <Media
                  eager
                  image={member.image}
                  alt={text(member.name)}
                  key={member.slug}
                />
              ))}
            </div>
          ) : undefined
        }
      >
        <Action href="#team-members">
          {zh ? "认识团队" : "Meet our team"}
        </Action>
      </Hero>
      {lead && (
        <section className="v41-wrap v41-section">
          <Heading
            title={zh ? "团队负责人" : "Principal investigator"}
            eyebrow="PRINCIPAL INVESTIGATOR"
          />
          <article className="v41-lead" id={lead.slug}>
            {portrait(lead, true)}
            <div className="v41-card-body">
              <h2>{text(lead.name)}</h2>
              <p className="v41-direction-subtitle">
                {zh ? lead.name?.en : text(lead.degree)}
              </p>
              <p className="v41-identity">
                {[text(lead.degree), text(lead.role)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {!isDemoContent({ description: lead.bio }) && (
                <p className="v41-description">{text(lead.bio)}</p>
              )}
              <div className="v41-tags">
                {[lead.research, lead.focus]
                  .filter((value) => text(value))
                  .slice(0, 2)
                  .map((value, index) => (
                    <Tag key={index}>{text(value)}</Tag>
                  ))}
              </div>
            </div>
            <div className="v41-lead-contact">
              <h3>{zh ? "公开联系信息" : "Public contact information"}</h3>
              {contacts(lead)}
              {!lead.contacts?.length && !lead.links?.length && (
                <Action href="/contact" secondary>
                  {zh ? "联系课题组" : "Contact the lab"}
                </Action>
              )}
              {text(lead.subtitle) && (
                <p className="v41-description">{text(lead.subtitle)}</p>
              )}
            </div>
          </article>
        </section>
      )}
      <section id="team-members" className="v41-wrap v41-section">
        <Heading
          title={zh ? "团队成员" : "Team members"}
          eyebrow="TEAM MEMBERS"
        />
        <div className="v41-team-groups">
          {groups
            .filter((group) => group.members.length)
            .map((group) => (
              <section key={group.key} className="v41-team-group">
                {group.key === "alumni" ? (
                  <details className="v41-alumni">
                    <summary>
                      <span>
                        {text(data.sectionTitles?.[group.key]) ||
                          (zh ? "校友" : "Alumni")}
                      </span>
                      <small>
                        {group.en} · {group.members.length}
                      </small>
                    </summary>
                    {groupContent(group)}
                  </details>
                ) : (
                  <>
                    <header>
                      <h2>
                        {text(data.sectionTitles?.[group.key]) || group.en}
                      </h2>
                      <span>{group.members.length}</span>
                    </header>
                    <p className="v41-eyebrow">{group.en}</p>
                    {groupContent(group)}
                  </>
                )}
              </section>
            ))}
        </div>
      </section>
      <ContactCta
        locale={locale}
        title={
          !isDemoContent(data.recruitment) ? data.recruitment?.title : undefined
        }
        description={
          !isDemoContent(data.recruitment)
            ? data.recruitment?.description
            : undefined
        }
      />
      <dialog
        className="v41-photo-dialog"
        ref={dialog}
        onClose={() => setPhoto(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <button
          type="button"
          onClick={() => dialog.current?.close()}
          aria-label={zh ? "关闭照片" : "Close photo"}
        >
          ×
        </button>
        {photo && (
          <>
            <img
              src={sanitizePublicUrl(photo.image?.src)}
              alt={text(photo.name)}
            />
            <p>{text(photo.name)}</p>
          </>
        )}
      </dialog>
    </main>
  );
}
