"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PageHeader } from "./PageHeader";
import { useLanguage } from "./LanguageProvider";
import { getLocalizedText, normalizeInternalHref } from "./i18n";

function LabeledValue({ label, value }: { label: string; value: string }) {
  return value ? <div><dt className="text-[10px] font-bold uppercase text-secondary">{label}</dt><dd className="mt-1 text-sm leading-6 text-on-surface-variant">{value}</dd></div> : null;
}

function MemberPhoto({ image, name, featured }: { image: any; name: string; featured: boolean }) {
  const [preview, setPreview] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const size = featured ? "h-32 w-28 sm:h-36 sm:w-32" : "h-24 w-24";

  useEffect(() => {
    if (!preview) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      trigger?.focus();
    };
  }, [preview]);

  if (!image?.src) return <div aria-hidden="true" className={`${size} shrink-0 bg-slate-100`}/>;

  const alt = image.alt || name;
  const cropStyle = {
    objectPosition: `${image.positionX ?? 50}% ${image.positionY ?? 50}%`,
    transform: `scale(${image.zoom ?? 1})`,
    transformOrigin: `${image.positionX ?? 50}% ${image.positionY ?? 50}%`
  };

  return <>
    <button aria-label={`查看${name}的照片大图`} className={`${size} group relative shrink-0 cursor-zoom-in overflow-hidden bg-slate-100`} onClick={() => setPreview(true)} ref={triggerRef} type="button">
      <img alt={alt} className="h-full w-full object-cover transition duration-300 group-hover:opacity-90" src={image.src} style={cropStyle}/>
      <span aria-hidden="true" className="absolute bottom-2 right-2 grid h-7 w-7 place-items-center bg-slate-950/75 text-lg leading-none text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">+</span>
    </button>
    {preview ? createPortal(<div aria-label={`${name}的照片大图`} aria-modal="true" className="fixed inset-0 z-[9999] grid place-items-center bg-slate-950/80 p-4 sm:p-8" onClick={() => setPreview(false)} role="dialog">
      <div className="relative flex max-h-[92vh] max-w-5xl flex-col bg-white p-3 shadow-2xl sm:p-4" onClick={(event) => event.stopPropagation()}>
        <button aria-label="关闭照片大图" className="absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center bg-slate-950 text-2xl leading-none text-white" onClick={() => setPreview(false)} ref={closeButtonRef} type="button">×</button>
        <img alt={alt} className="max-h-[78vh] max-w-full object-contain" src={image.src}/>
        <p className="px-1 pb-1 pt-3 pr-12 font-serif text-lg font-semibold text-primary">{name}</p>
      </div>
    </div>, document.body) : null}
  </>;
}

function MemberCard({ member, group, labels, featured = false }: { member: any; group: string; labels: any; featured?: boolean }) {
  const { locale } = useLanguage();
  const name = getLocalizedText(member.name, locale);
  const summary = [getLocalizedText(member.degree, locale), getLocalizedText(member.enrollmentYear, locale), getLocalizedText(member.role, locale)].filter(Boolean).join(" · ");
  const research = getLocalizedText(member.research, locale) || getLocalizedText(member.focus, locale);
  const bio = getLocalizedText(member.bio, locale);
  const major = getLocalizedText(member.major, locale);

  return <article className={`flex h-full flex-col border border-slate-200 border-t-2 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-t-cyan-600 hover:shadow-panel ${featured ? "border-t-cyan-600 p-5 sm:p-6" : "p-5"}`}>
    <div className={`flex ${featured ? "flex-col items-start gap-5 sm:flex-row" : "gap-4"}`}>
      <MemberPhoto featured={featured} image={member.image} name={name}/>
      <div className="min-w-0 flex-1">
        <h3 className={`font-serif font-semibold leading-tight text-primary ${featured ? "text-2xl" : "text-xl"}`}>{name}</h3>
        {getLocalizedText(member.subtitle, locale) ? <p className="mt-2 text-sm text-on-surface-variant">{getLocalizedText(member.subtitle, locale)}</p> : null}
        {summary ? <p className="mt-2 text-sm font-semibold text-secondary">{summary}</p> : null}
        {major ? <p className="mt-2 text-xs leading-5 text-slate-500">{major}</p> : null}
        {featured && research ? <dl className="mt-5"><LabeledValue label={getLocalizedText(group === "postdoc" ? labels.researchFocus : labels.researchDirection, locale)} value={research}/></dl> : null}
      </div>
    </div>
    {bio ? <p className={`${featured ? "mt-6 border-t border-slate-100 pt-5" : "mt-5"} text-sm leading-7 text-on-surface-variant`}>{bio}</p> : null}
    <dl className="mt-5 space-y-4">
      {!featured ? <LabeledValue label={getLocalizedText(group === "postdoc" ? labels.researchFocus : labels.researchDirection, locale)} value={research}/> : null}
      <LabeledValue label={getLocalizedText(labels.alumniGraduation, locale)} value={getLocalizedText(member.graduation, locale)}/>
      <LabeledValue label={getLocalizedText(labels.alumniThesis, locale)} value={getLocalizedText(member.thesis, locale)}/>
      <LabeledValue label={getLocalizedText(labels.alumniDestination, locale)} value={getLocalizedText(member.destination, locale)}/>
    </dl>
    {member.links?.length ? <section className="mt-5 border-t border-slate-200 pt-4"><h4 className="text-[10px] font-bold uppercase text-secondary">{getLocalizedText(labels.personalLinks, locale)}</h4><div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">{member.links.filter((link: any) => link.href).map((link: any, index: number) => <a className="text-sm font-semibold text-primary underline decoration-slate-300 underline-offset-4 hover:decoration-cyan-600" href={normalizeInternalHref(link.href)} key={index}>{getLocalizedText(link.label, locale)}</a>)}</div></section> : null}
    {member.contacts?.length ? <section className="mt-5 border-t border-slate-200 pt-4"><h4 className="text-[10px] font-bold uppercase text-secondary">{getLocalizedText(labels.contactInfo, locale)}</h4><dl className="mt-2 space-y-2">{member.contacts.map((contact: any, index: number) => <div className="grid grid-cols-[auto_1fr] gap-3 text-sm" key={index}><dt className="font-medium text-primary">{getLocalizedText(contact.label, locale)}</dt><dd className="break-all text-on-surface-variant">{getLocalizedText(contact.value, locale)}</dd></div>)}</dl></section> : null}
  </article>;
}

export function TeamPage({ data }: { data: any }) {
  const { locale } = useLanguage();
  const groups = [["faculty", "advisor", data.advisors], ["postdocs", "postdoc", data.postdocs], ["phd", "phd", data.phdStudents], ["master", "master", data.masterStudents], ["undergrad", "undergrad", data.undergraduateStudents], ["alumni", "alumni", data.alumni]];

  return <main className="mx-auto max-w-[1920px] px-5 pb-20 pt-12 sm:px-6 lg:px-8">
    <PageHeader header={data.header}/>
    <div className="space-y-16">
      {groups.map(([key, group, members]: any) => members?.length ? <section key={key}>
        <h2 className="mb-7 border-l-4 border-cyan-600 pl-4 font-serif text-3xl text-primary">{getLocalizedText(data.sectionTitles?.[key], locale)}</h2>
        <div className={group === "advisor" || group === "postdoc" ? "team-featured-grid grid gap-6" : "team-member-grid grid auto-rows-fr gap-5"}>
          {members.map((member: any) => <MemberCard featured={group === "advisor" || group === "postdoc"} group={group} key={member.slug} labels={data.sectionTitles} member={member}/>) }
        </div>
      </section> : null)}
    </div>
    <section className="mt-20 bg-primary p-9 text-white sm:flex sm:items-center sm:justify-between"><div><h2 className="font-serif text-3xl">{getLocalizedText(data.recruitment?.title, locale)}</h2><p className="mt-3 max-w-2xl text-blue-100">{getLocalizedText(data.recruitment?.description, locale)}</p></div><Link className="mt-6 inline-block bg-cyan-300 px-5 py-3 font-semibold text-primary sm:mt-0" href={data.recruitment?.buttonHref || "/contact"}>{getLocalizedText(data.recruitment?.buttonLabel, locale)}</Link></section>
  </main>;
}
