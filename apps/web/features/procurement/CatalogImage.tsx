"use client";

/* Product images are small COS-hosted assets with runtime URLs, so native img keeps the component portable. */
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";

export function CatalogImage({ src, alt, size = "md" }: { src: string | null; alt: string; size?: "sm" | "md" }) {
  const [preview, setPreview] = useState(false);
  const dimensions = size === "sm" ? "h-14 w-14" : "h-20 w-20";
  if (!src) return <div aria-label="暂无图片" className={`${dimensions} grid shrink-0 place-items-center border border-slate-200 bg-slate-50 text-[10px] text-slate-400`}>暂无图片</div>;
  return <>
    <button aria-label={`查看${alt}图片`} className={`${dimensions} shrink-0 overflow-hidden border border-slate-200 bg-white`} onClick={() => setPreview(true)} type="button"><img alt={alt} className="h-full w-full object-contain" loading="lazy" src={src}/></button>
    {preview ? <div aria-modal="true" className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/70 p-5" role="dialog" onClick={() => setPreview(false)}><div className="relative max-h-[90vh] max-w-2xl bg-white p-4" onClick={(event) => event.stopPropagation()}><button aria-label="关闭图片预览" className="absolute right-2 top-2 grid h-9 w-9 place-items-center bg-slate-950 text-xl text-white" onClick={() => setPreview(false)} type="button">×</button><img alt={alt} className="max-h-[78vh] max-w-full object-contain" src={src}/><p className="mt-3 pr-10 text-sm font-semibold text-slate-700">{alt}</p></div></div> : null}
  </>;
}
