"use client";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "./LanguageProvider";
import { getLocalizedText } from "./i18n";
import { ContactCta, Heading, Hero, Media } from "./ui4/Primitives";
import { MemberCard } from "./ui4/MemberCard";
import { MemberProfileDialog } from "./ui4/MemberProfileDialog";
import { isDemoContent } from "./ui4/content";
import { sanitizePublicUrl } from "./url-sanitizer";

export function TeamPage({ data }: { data: any }) {
  const { locale } = useLanguage(),
    zh = locale === "zh",
    text = (value: unknown) => getLocalizedText(value, locale);
  const [selectedMember, setSelectedMember] = useState<any>(null),
    profileTrigger = useRef<HTMLElement | null>(null);
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
  const openProfile = (member: any) => {
    profileTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedMember(member);
  };
  const closeProfile = () => {
    setSelectedMember(null);
    window.requestAnimationFrame(() => profileTrigger.current?.focus());
  };
  const person = (member: any) => (
    <MemberCard
      key={member.slug}
      member={member}
      locale={locale}
      onOpenProfile={() => openProfile(member)}
      portrait={
        <button type="button" aria-haspopup="dialog" aria-label={zh ? `查看${text(member.name)}的公开资料` : `View ${text(member.name)}’s public profile`} onClick={() => openProfile(member)}>
          {sanitizePublicUrl(member.image?.src) ? <Media image={member.image} alt={text(member.name)} sizes="80px" /> : <Media alt={text(member.name)} />}
        </button>
      }
    />
  );
  const groupContent = (group: any) => (
    <div className="v41-group-people">{group.members.map(person)}</div>
  );
  return (
    <main>
      <Hero
        variant="fullBleed"
        header={{
          ...data.header,
          title: data.header?.title || { zh: "团队成员", en: "Our team" },
          eyebrow: "PEOPLE DRIVE RESEARCH",
        }}
        locale={locale}
        image={data.header?.image}
        focalPosition={[68, 44]}
        mobileFocalPosition={[65, 42]}
      />
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
        image={data.header?.image}
        layered
      />
      <MemberProfileDialog locale={locale} member={selectedMember} onClose={closeProfile} />
    </main>
  );
}
