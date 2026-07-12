"use client";

export default function ErrorPage({ reset }: { reset(): void }) {
  return <main className="grid min-h-[60vh] place-items-center bg-surface px-5"><section className="max-w-lg border border-slate-200 bg-white p-8 text-center"><h1 className="font-serif text-2xl font-semibold text-primary">页面暂时不可用</h1><p className="mt-3 text-slate-600">公开内容加载失败，请稍后重试。</p><button className="mt-6 bg-primary px-5 py-3 font-semibold text-white" type="button" onClick={reset}>重新加载</button></section></main>;
}
