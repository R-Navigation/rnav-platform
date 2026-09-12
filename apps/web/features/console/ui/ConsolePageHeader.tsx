import type { ReactNode } from "react";

export function ConsolePageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 border-b border-slate-200 pb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold tracking-wide text-cyan-700">{eyebrow}</p>
        <h1 className="mt-2 text-balance font-serif text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}
