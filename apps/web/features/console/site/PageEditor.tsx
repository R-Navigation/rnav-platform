"use client";

type JsonObject = Record<string, unknown>;
type Props = { value: unknown; onChange(value: unknown): void };
const inputClass = "w-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-600";

function titleFor(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase());
}

function Field({ label, value, onChange, depth = 0 }: { label: string; value: unknown; onChange(value: unknown): void; depth?: number }) {
  if (typeof value === "boolean") {
    return (
      <label className="flex items-center gap-3 py-2 text-sm text-slate-800">
        <input checked={value} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
        {titleFor(label)}
      </label>
    );
  }
  if (typeof value === "string" || typeof value === "number" || value == null) {
    const text = value == null ? "" : String(value);
    const multiline = text.length > 100 || /description|bio|abstract|copyright/i.test(label);
    return (
      <label className="block text-sm font-semibold text-slate-700">
        <span className="mb-1 block">{titleFor(label)}</span>
        {multiline ? (
          <textarea className={`${inputClass} min-h-24`} value={text} onChange={(event) => onChange(event.target.value)} />
        ) : (
          <input
            className={inputClass}
            inputMode={typeof value === "number" ? "decimal" : undefined}
            value={text}
            onChange={(event) => onChange(typeof value === "number" ? Number(event.target.value) : event.target.value)}
          />
        )}
      </label>
    );
  }
  if (Array.isArray(value)) {
    return (
      <div className="border-l-2 border-slate-200 pl-4">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h3 className="text-sm font-bold text-slate-800">{titleFor(label)}</h3>
          <button className="text-sm font-semibold text-cyan-800 underline" onClick={() => onChange([...value, {}])} type="button">
            新增
          </button>
        </div>
        <div className="space-y-5">
          {value.map((item, index) => (
            <div className="border-t border-slate-200 pt-4" key={index}>
              <div className="mb-2 flex justify-end">
                <button className="text-xs font-semibold text-red-700 underline" onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))} type="button">
                  删除 #{index + 1}
                </button>
              </div>
              <Field
                depth={depth + 1}
                label={`${label} ${index + 1}`}
                value={item}
                onChange={(next) => onChange(value.map((current, itemIndex) => itemIndex === index ? next : current))}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }
  const object = value as JsonObject;
  return (
    <fieldset className={depth ? "border-l-2 border-slate-200 pl-4" : ""}>
      <legend className="mb-3 text-sm font-bold text-slate-800">{titleFor(label)}</legend>
      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(object).map(([key, item]) => (
          <div className={item && typeof item === "object" ? "md:col-span-2" : ""} key={key}>
            <Field depth={depth + 1} label={key} value={item} onChange={(next) => onChange({ ...object, [key]: next })} />
          </div>
        ))}
      </div>
      {Object.keys(object).length === 0 ? <p className="text-sm text-slate-500">当前对象为空，请切换到 JSON 模式添加字段。</p> : null}
    </fieldset>
  );
}

export function PageEditor({ value, onChange }: Props) {
  return <Field label="内容" onChange={onChange} value={value} />;
}
