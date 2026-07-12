"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { getTrappedFocusIndex } from "./dialog-keyboard";

type Props = {
  onCancel(): void;
  onDiscard(): void;
  restoreFocusTo: HTMLElement | null;
};

export function DiscardDialog({ onCancel, onDiscard, restoreFocusTo }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    return () => restoreFocusTo?.focus();
  }, [restoreFocusTo]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? []);
    const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
    const nextIndex = getTrappedFocusIndex(currentIndex, focusable.length, event.shiftKey);
    if (nextIndex === null) return;
    event.preventDefault();
    focusable[nextIndex]?.focus();
  }

  return (
    <div aria-labelledby="discard-title" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-5" onKeyDown={handleKeyDown} ref={dialogRef} role="dialog">
      <div className="w-full max-w-md bg-white p-6 shadow-xl">
        <h2 className="text-xl font-bold text-slate-950" id="discard-title">放弃未保存更改？</h2>
        <p className="mt-3 leading-6 text-slate-600">切换模块会丢失当前模块的本地更改。</p>
        <div className="mt-6 flex justify-end gap-3">
          <button className="border border-slate-400 px-4 py-2 text-sm font-bold text-slate-800" onClick={onCancel} ref={cancelRef} type="button">继续编辑</button>
          <button className="bg-red-700 px-4 py-2 text-sm font-bold text-white" onClick={onDiscard} type="button">放弃并切换</button>
        </div>
      </div>
    </div>
  );
}
