import Link from "next/link";
import type { ConsoleBootstrap } from "@/features/console/bootstrap";
import { TierBadge } from "@/features/console/TierBadge";

export function ConsoleHome({ bootstrap }: { bootstrap: ConsoleBootstrap }) {
  const { consoleModules, user } = bootstrap;

  return (
    <div>
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-cyan-700">控制台首页</p>
          <h1 className="mt-2 font-serif text-3xl font-bold text-slate-950">
            欢迎，{user.displayName || user.username}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">选择一个可用模块开始管理实验室事务。</p>
        </div>
        <TierBadge tier={user.tier} />
      </div>

      <section aria-labelledby="available-modules-heading" className="mt-9">
        <h2 id="available-modules-heading" className="font-serif text-xl font-semibold text-slate-900">
          可用模块
        </h2>
        <div className="mt-5 grid gap-px overflow-hidden border border-slate-200 bg-slate-200 sm:grid-cols-2 xl:grid-cols-3">
          {consoleModules.map((module) => (
            <Link
              className="group min-h-36 bg-white p-5 transition-colors hover:bg-cyan-50 focus-visible:relative"
              href={module.href}
              key={module.key}
            >
              <span className="text-xs font-bold uppercase text-slate-400">{module.key}</span>
              <h3 className="mt-5 text-lg font-bold text-slate-900 group-hover:text-cyan-800">
                {module.label}
              </h3>
              <p className="mt-2 text-sm text-slate-500">进入模块</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
