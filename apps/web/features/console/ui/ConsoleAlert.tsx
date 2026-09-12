import type { ReactNode } from "react";
import { ConsoleIcon } from "./ConsoleIcon";

const tones = { info: "border-cyan-200 bg-cyan-50 text-cyan-950", success: "border-emerald-200 bg-emerald-50 text-emerald-950", warning: "border-amber-200 bg-amber-50 text-amber-950", danger: "border-red-200 bg-red-50 text-red-950" };
export function ConsoleAlert({ tone = "info", title, children }: { tone?: keyof typeof tones; title?: string; children: ReactNode }) {
  return <div className={`flex gap-3 rounded-lg border px-4 py-3 text-sm ${tones[tone]}`} role={tone === "danger" ? "alert" : "status"}><ConsoleIcon className="mt-0.5 size-4 shrink-0" name={tone === "warning" || tone === "danger" ? "warning" : tone === "success" ? "check" : "info"}/><div>{title ? <p className="font-semibold">{title}</p> : null}<div className={title ? "mt-1 text-xs leading-5 opacity-80" : "leading-5"}>{children}</div></div></div>;
}
