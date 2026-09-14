"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ConsoleButton } from "./ConsoleButton";
import { ConsoleIcon } from "./ConsoleIcon";

function useOverlay(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusable = () => Array.from(node?.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])') || []).filter((item) => !item.hasAttribute("disabled"));
    focusable()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
      if (event.key !== "Tab") return;
      const items = focusable(); if (!items.length) return;
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", keydown); document.body.style.overflow = ""; previous?.focus(); };
  }, [open]);
  return ref;
}

export function ConsoleDrawer({ open, onClose, title, children, side = "right" }: { open: boolean; onClose: () => void; title: string; children: ReactNode; side?: "left" | "right" }) {
  const ref = useOverlay(open, onClose); if (!open) return null;
  return <div aria-modal="true" className="fixed inset-0 z-[80] bg-slate-950/35 backdrop-blur-[1px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} role="dialog"><div className={`absolute inset-y-0 ${side === "left" ? "left-0" : "right-0"} flex w-[min(28rem,calc(100vw-2rem))] flex-col bg-white shadow-2xl`} ref={ref}><header className="flex min-h-14 items-center justify-between border-b border-slate-200 px-5"><h2 className="font-semibold text-slate-950">{title}</h2><ConsoleButton aria-label="关闭" onClick={onClose} size="sm" variant="ghost"><ConsoleIcon className="size-5" name="close"/></ConsoleButton></header><div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div></div></div>;
}

export function ConsoleDialog({ open, onClose, title, description, children, footer }: { open: boolean; onClose: () => void; title: string; description?: string; children?: ReactNode; footer?: ReactNode }) {
  const ref = useOverlay(open, onClose); if (!open) return null;
  return <div aria-modal="true" className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/35 p-4 backdrop-blur-[1px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} role="dialog"><div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl" ref={ref}><header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4"><div><h2 className="font-semibold text-slate-950">{title}</h2>{description ? <p className="mt-1 text-sm leading-5 text-slate-500">{description}</p> : null}</div><ConsoleButton aria-label="关闭" onClick={onClose} size="sm" variant="ghost"><ConsoleIcon name="close"/></ConsoleButton></header>{children ? <div className="p-5">{children}</div> : null}{footer ? <footer className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">{footer}</footer> : null}</div></div>;
}

export function ConsoleConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = "确认", danger = false }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; description: string; confirmLabel?: string; danger?: boolean }) {
  return <ConsoleDialog description={description} footer={<><ConsoleButton onClick={onClose}>取消</ConsoleButton><ConsoleButton onClick={onConfirm} variant={danger ? "danger" : "primary"}>{confirmLabel}</ConsoleButton></>} onClose={onClose} open={open} title={title}/>;
}
