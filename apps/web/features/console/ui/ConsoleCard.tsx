import type { HTMLAttributes, ReactNode } from "react";

export function ConsoleCard({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`} {...props} />;
}

export function ConsoleCardHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-sm font-semibold text-slate-950">{title}</h2>{description ? <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p> : null}</div>{actions ? <div className="shrink-0">{actions}</div> : null}</div>;
}
