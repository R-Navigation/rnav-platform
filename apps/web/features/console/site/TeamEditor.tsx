"use client";

type Locale = { zh?: string; en?: string };
type Member = { slug?: string; group?: string; name?: Locale; role?: Locale; bio?: Locale; [key: string]: unknown };
const groups = ["advisor", "postdoc", "phd", "master", "undergrad", "alumni"];
const inputClass = "w-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-600";
const labelClass = "text-sm font-semibold text-slate-700";

export function TeamEditor({ value, onChange }: { value: unknown; onChange(value: unknown): void }) {
  const members = Array.isArray(value) ? value as Member[] : [];
  const update = (index: number, patch: Partial<Member>) => onChange(members.map((member, itemIndex) => itemIndex === index ? { ...member, ...patch } : member));
  const locale = (index: number, key: "name" | "role" | "bio", language: "zh" | "en", text: string) => update(index, { [key]: { ...(members[index][key] as Locale ?? {}), [language]: text } });
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          className="bg-blue-950 px-4 py-2 text-sm font-bold text-white"
          onClick={() => onChange([...members, { slug: `member-${members.length + 1}`, group: "phd", name: { zh: "", en: "" }, role: { zh: "", en: "" }, bio: { zh: "", en: "" }, links: [], contacts: [] }])}
          type="button"
        >
          新增成员
        </button>
      </div>
      {members.map((member, index) => (
        <section aria-labelledby={`team-member-${index}`} className="border-t border-slate-300 pt-5" key={`${member.slug}-${index}`}>
          <div className="mb-4 flex items-center justify-between gap-4">
            <h3 className="font-bold text-slate-900" id={`team-member-${index}`}>
              {member.name?.zh || member.name?.en || `成员 ${index + 1}`}
            </h3>
            <button className="text-sm font-semibold text-red-700 underline" onClick={() => onChange(members.filter((_, itemIndex) => itemIndex !== index))} type="button">
              删除
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className={labelClass}>Slug<input className={`${inputClass} mt-1`} value={member.slug ?? ""} onChange={(event) => update(index, { slug: event.target.value })} /></label>
            <label className={labelClass}>分组<select className={`${inputClass} mt-1`} value={member.group ?? "phd"} onChange={(event) => update(index, { group: event.target.value })}>{groups.map((group) => <option key={group}>{group}</option>)}</select></label>
            {(["name", "role"] as const).flatMap((key) => (["zh", "en"] as const).map((language) => (
              <label className={labelClass} key={`${key}-${language}`}>{key} {language.toUpperCase()}<input className={`${inputClass} mt-1`} value={member[key]?.[language] ?? ""} onChange={(event) => locale(index, key, language, event.target.value)} /></label>
            )))}
            <label className={`${labelClass} md:col-span-2`}>简介 ZH<textarea className={`${inputClass} mt-1 min-h-24`} value={member.bio?.zh ?? ""} onChange={(event) => locale(index, "bio", "zh", event.target.value)} /></label>
            <label className={`${labelClass} md:col-span-2`}>Bio EN<textarea className={`${inputClass} mt-1 min-h-24`} value={member.bio?.en ?? ""} onChange={(event) => locale(index, "bio", "en", event.target.value)} /></label>
          </div>
        </section>
      ))}
    </div>
  );
}
