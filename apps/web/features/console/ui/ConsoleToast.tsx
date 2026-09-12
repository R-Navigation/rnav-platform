"use client";
import { useEffect } from "react";
import { ConsoleIcon } from "./ConsoleIcon";

export function ConsoleToast({ message, tone = "success", onDismiss }: { message: string; tone?: "success" | "danger" | "info"; onDismiss: () => void }) {
  useEffect(() => { const timer = window.setTimeout(onDismiss, 4000); return () => window.clearTimeout(timer); }, [onDismiss]);
  return <div className={`fixed bottom-5 right-5 z-[100] flex max-w-sm items-start gap-3 rounded-lg border bg-white px-4 py-3 text-sm shadow-xl ${tone === "danger" ? "border-red-200 text-red-800" : tone === "info" ? "border-cyan-200 text-cyan-900" : "border-emerald-200 text-emerald-800"}`} role="status"><ConsoleIcon className="mt-0.5 size-4 shrink-0" name={tone === "danger" ? "warning" : tone === "success" ? "check" : "info"}/><span>{message}</span><button aria-label="关闭提示" className="ml-2 text-slate-400 hover:text-slate-800" onClick={onDismiss}><ConsoleIcon name="close"/></button></div>;
}
