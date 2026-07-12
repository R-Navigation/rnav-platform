import Link from "next/link";
import { Suspense } from "react";

const navigation = [
  { href: "/", label: "首页" },
  { href: "/research", label: "研究方向" },
  { href: "/team", label: "团队成员" },
  { href: "/facilities", label: "实验设施" },
  { href: "/news", label: "新闻动态" },
  { href: "/contact", label: "联系我们" },
  { href: "/monitor", label: "运行监控" },
] as const;

type PublicRouteShellProps = {
  description: string;
  eyebrow?: string;
  title: string;
};

async function MigratingRouteContent() {
  await Promise.resolve();

  return (
    <div className="border-l-2 border-cyan-600 pl-5 text-sm leading-7 text-slate-600">
      页面数据边界已就绪，现有站点内容将在后续迁移任务中接入。
    </div>
  );
}

function RouteContentFallback() {
  return (
    <div className="max-w-xl" aria-label="页面内容加载中" aria-live="polite">
      <div className="h-4 w-full animate-pulse bg-slate-200" />
      <div className="mt-3 h-4 w-2/3 animate-pulse bg-slate-200" />
    </div>
  );
}

export function PublicRouteShell({
  description,
  eyebrow = "RNAV LAB",
  title,
}: PublicRouteShellProps) {
  return (
    <div className="min-h-screen bg-surface text-ink">
      <header className="border-b border-slate-200/90 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <Link className="font-serif text-xl font-bold text-blue-950" href="/">
            RNAV Lab
          </Link>
          <nav aria-label="网站主导航" className="flex gap-5 overflow-x-auto pb-1 text-sm text-slate-600 lg:pb-0">
            {navigation.map((item) => (
              <Link
                className="whitespace-nowrap transition-colors hover:text-cyan-700"
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Link
            className="w-fit border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-cyan-600 hover:text-cyan-700"
            href="/login"
          >
            管理登录
          </Link>
        </div>
      </header>

      <main>
        <section className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8 lg:py-28">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-700">
              {eyebrow}
            </p>
            <h1 className="mt-5 max-w-4xl font-serif text-4xl font-bold leading-tight text-blue-950 sm:text-5xl">
              {title}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
              {description}
            </p>
          </div>
        </section>

        <section aria-labelledby="route-content-heading">
          <div className="mx-auto max-w-7xl px-5 py-14 sm:px-6 lg:px-8">
            <h2 id="route-content-heading" className="mb-7 font-serif text-2xl font-semibold text-slate-900">
              页面内容
            </h2>
            <Suspense fallback={<RouteContentFallback />}>
              <MigratingRouteContent />
            </Suspense>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-7xl px-5 py-8 text-sm text-slate-500 sm:px-6 lg:px-8">
          RNAV Lab 统一平台迁移中
        </div>
      </footer>
    </div>
  );
}
