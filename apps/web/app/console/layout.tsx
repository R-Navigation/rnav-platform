import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ConsoleState } from "@/features/console/ConsoleState";
import { getConsoleBootstrap } from "@/features/console/bootstrap";
import { TierBadge } from "@/features/console/TierBadge";

export default async function ConsoleLayout({ children }: Readonly<{ children: ReactNode }>) {
  const result = await getConsoleBootstrap();

  if (result.status === "anonymous") {
    redirect("/login?next=/console");
  }
  if (result.status === "forbidden") {
    return (
      <ConsoleState
        description="当前账号已登录，但没有访问管理控制台的权限。请联系管理员调整账号权限。"
        title="无控制台访问权限"
      />
    );
  }
  if (result.status === "error") {
    return <ConsoleState description={result.message} title="控制台暂时不可用" />;
  }

  const { consoleModules, user } = result.data;

  return (
    <div className="min-h-screen bg-surface text-ink lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="border-b border-slate-200 bg-white lg:min-h-screen lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-5 lg:block">
          <Link className="font-serif text-xl font-bold text-blue-950" href="/console">
            RNAV Console
          </Link>
          <div className="lg:mt-4">
            <TierBadge tier={user.tier} />
          </div>
        </div>
        <nav aria-label="控制台模块" className="flex gap-1 overflow-x-auto px-3 py-3 lg:block lg:space-y-1 lg:overflow-visible">
          <Link
            className="block whitespace-nowrap px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-cyan-800"
            href="/console"
          >
            控制台首页
          </Link>
          {consoleModules.map((module) => (
            <Link
              className="block whitespace-nowrap px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-cyan-800"
              href={module.href}
              key={module.key}
            >
              {module.label}
            </Link>
          ))}
        </nav>
        <div className="hidden border-t border-slate-200 px-5 py-5 text-sm text-slate-500 lg:block">
          <p className="font-semibold text-slate-800">{user.displayName || user.username}</p>
          <p className="mt-1">@{user.username}</p>
          <Link className="mt-4 inline-block text-cyan-800 underline" href="/">
            返回网站
          </Link>
        </div>
      </aside>
      <main className="min-w-0 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">{children}</main>
    </div>
  );
}
