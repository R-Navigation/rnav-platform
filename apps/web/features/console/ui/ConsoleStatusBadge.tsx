import type { ReactNode } from "react";

const tones = {
  neutral: "bg-slate-100 text-slate-700",
  info: "bg-cyan-50 text-cyan-800",
  success: "bg-emerald-50 text-emerald-800",
  warning: "bg-amber-50 text-amber-800",
  danger: "bg-red-50 text-red-800",
};

export function ConsoleStatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: keyof typeof tones }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${tones[tone]}`}>{children}</span>;
}
