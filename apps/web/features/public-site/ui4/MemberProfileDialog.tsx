"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { memberProfileLoader, type MemberProfilePayload } from "../member-profile";
import { getLocalizedText, type Locale } from "../i18n";
import { sanitizePublicUrl } from "../url-sanitizer";
import { Media } from "./Primitives";
import "./member-profile-dialog.css";

export function MemberProfileDialog({ locale, member, onClose }: { locale: Locale; member: any | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [payload, setPayload] = useState<MemberProfilePayload | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(false), [tab, setTab] = useState<"overview" | "publications">("overview");
  const zh = locale === "zh", text = (value: unknown) => getLocalizedText(value, locale);
  const memberSlug = member?.slug;
  const load = useCallback(async (force = false) => {
    if (!memberSlug) return;
    setLoading(true); setError("");
    try { setPayload(await memberProfileLoader.load(memberSlug, force)); }
    catch (reason) { setPayload(null); setError(reason instanceof Error ? reason.message : zh ? "暂时无法加载成员资料" : "Unable to load this profile"); }
    finally { setLoading(false); }
  }, [memberSlug, zh]);
  useEffect(() => {
    if (!member) return;
    setTab("overview"); setPayload(null); setError("");
    if (!dialog.current?.open) dialog.current?.showModal();
    void load();
  }, [load, member, memberSlug]);
  const close = () => dialog.current?.close();
  const profile = payload?.member ?? member;
  const publications = payload?.publications ?? [];
  const facts = [
    [zh ? "专业" : "Major", profile?.major], [zh ? "毕业信息" : "Graduation", profile?.graduation],
    [zh ? "毕业论文" : "Thesis", profile?.thesis], [zh ? "毕业去向" : "Destination", profile?.destination],
  ].filter(([, value]) => text(value));
  return <dialog aria-labelledby="member-profile-title" className="rnav-member-dialog" ref={dialog} onClose={onClose} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    {member ? <div className="rnav-member-dialog-shell">
      <button aria-label={zh ? "关闭成员资料" : "Close member profile"} className="rnav-member-dialog-close" onClick={close} type="button">×</button>
      <header className="rnav-member-dialog-header">
        <div className="rnav-member-dialog-photo">{profile?.image?.src ? <Media image={profile.image} alt={text(profile.name)} sizes="144px" /> : <Media alt={text(profile?.name) || (zh ? "成员照片" : "Member portrait")} />}</div>
        <div><p className="rnav-member-dialog-kicker">{zh ? "团队成员" : "TEAM MEMBER"}</p><h2 id="member-profile-title">{text(profile?.name)}</h2>{zh && profile?.name?.en ? <p className="rnav-member-dialog-en">{profile.name.en}</p> : null}<p className="rnav-member-dialog-identity">{[text(profile?.role), text(profile?.degree), text(profile?.enrollmentYear)].filter(Boolean).join(" · ")}</p>{text(profile?.research) ? <p className="rnav-member-dialog-research">{text(profile.research)}</p> : null}</div>
      </header>
      <nav aria-label={zh ? "成员资料分区" : "Member profile sections"} className="rnav-member-dialog-tabs" role="tablist">
        <button aria-selected={tab === "overview"} onClick={() => setTab("overview")} role="tab" type="button">{zh ? "概览" : "Overview"}</button>
        <button aria-selected={tab === "publications"} onClick={() => setTab("publications")} role="tab" type="button">{zh ? `论文 (${publications.length})` : `Publications (${publications.length})`}</button>
      </nav>
      <div className="rnav-member-dialog-body">
        {loading ? <div className="rnav-member-dialog-state" role="status">{zh ? "正在加载成员资料…" : "Loading member profile…"}</div> : error ? <div className="rnav-member-dialog-state" role="alert"><p>{error}</p><button onClick={() => void load(true)} type="button">{zh ? "重试" : "Retry"}</button></div> : tab === "overview" ? <section aria-label={zh ? "成员概览" : "Member overview"}>
          {text(profile?.bio) ? <p className="rnav-member-dialog-bio">{text(profile.bio)}</p> : <p className="rnav-member-dialog-muted">{zh ? "该成员暂未公开个人简介。" : "No public biography is available."}</p>}
          {facts.length ? <dl className="rnav-member-dialog-facts">{facts.map(([label, value]) => <div key={String(label)}><dt>{String(label)}</dt><dd>{text(value)}</dd></div>)}</dl> : null}
          {(profile?.links?.length || profile?.contacts?.length) ? <div className="rnav-member-dialog-links">{(profile.links ?? []).map((link: any, index: number) => sanitizePublicUrl(link.href) ? <a href={sanitizePublicUrl(link.href)} key={index} rel="noopener noreferrer" target="_blank">{text(link.label) || (zh ? "个人主页" : "Website")} ↗</a> : null)}{(profile.contacts ?? []).map((contact: any, index: number) => <span key={index}>{text(contact.label)} · {text(contact.value)}</span>)}</div> : null}
        </section> : <section aria-label={zh ? "成员论文" : "Member publications"}>
          {publications.length ? <ol className="rnav-member-publications">{publications.map((publication: any) => <li key={publication.id}><p className="rnav-member-publication-meta">{[publication.year, text(publication.venue)].filter(Boolean).join(" · ")}</p><h3>{text(publication.title)}</h3>{publication.authors?.length ? <p>{publication.authors.map((author: any) => text(author.name)).filter(Boolean).join(", ")}</p> : null}<div>{(publication.links ?? []).map((link: any, index: number) => sanitizePublicUrl(link.href) ? <a href={sanitizePublicUrl(link.href)} key={index} rel="noopener noreferrer" target="_blank">{text(link.label) || "Link"} ↗</a> : null)}</div></li>)}</ol> : <p className="rnav-member-dialog-muted">{zh ? "暂无已审核发布的关联论文。" : "No reviewed publications are currently linked."}</p>}
        </section>}
      </div>
    </div> : null}
  </dialog>;
}
