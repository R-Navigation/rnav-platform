"use client";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "./LanguageProvider";
import { getLocalizedText } from "./i18n";
import { Action, ContactCta, Heading, Hero, Media } from "./ui4/Primitives";
import { MemberCard } from "./ui4/MemberCard";
import { isDemoContent } from "./ui4/content";
import { sanitizePublicUrl } from "./url-sanitizer";

export function TeamPage({ data }: { data: any }) {
  const { locale } = useLanguage(),
    zh = locale === "zh",
    text = (value: unknown) => getLocalizedText(value, locale);
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
  const person = (member: any) => (
    <MemberCard
      key={member.slug}
      member={member}
      locale={locale}
      portrait={
        sanitizePublicUrl(member.image?.src) ? (
          <button
            type="button"
            aria-label={
              zh
                ? `查看${text(member.name)}的照片`
                : `View ${text(member.name)}’s photo`
            }
            onClick={() => setPhoto(member)}
          >
            <Media image={member.image} alt={text(member.name)} sizes="80px" />
          </button>
        ) : (
          <Media alt={text(member.name)} />
        )
      }
    />
  );
  const groupContent = (group: any) => (
    <div className="v41-group-people">{group.members.map(person)}</div>
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
      >
        <Action href="#team-members">
          {zh ? "认识团队" : "Meet our team"}
        </Action>
      </Hero>
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
                <header>
                  <div>
                    <h2>{text(data.sectionTitles?.[group.key]) || group.en}</h2>
                    <p className="v41-eyebrow">{group.en}</p>
                  </div>
                  <span>
                    {group.members.length} {zh ? "位成员" : "members"}
                  </span>
                </header>
                {groupContent(group)}
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
