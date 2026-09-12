"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  groupConsoleModules,
  isConsoleRouteActive,
  type ConsoleNavigationModule,
} from "@/features/console/navigation";

type ConsoleSidebarNavProps = { modules: ConsoleNavigationModule[] };
const linkClassName = "block whitespace-nowrap border-l-2 px-3 py-2.5 text-sm font-semibold transition-colors";

export function ConsoleSidebarNav({ modules }: ConsoleSidebarNavProps) {
  const pathname = usePathname();
  const groups = groupConsoleModules(modules);
  const homeActive = isConsoleRouteActive(pathname, "/console");

  return (
    <nav aria-label="控制台导航" className="flex gap-4 overflow-x-auto px-3 py-3 lg:block lg:space-y-6 lg:overflow-visible lg:py-5">
      <section aria-labelledby="console-workbench-nav">
        <p className="hidden px-3 text-[11px] font-semibold tracking-[0.14em] text-slate-400 lg:block" id="console-workbench-nav">工作台</p>
        <Link aria-current={homeActive ? "page" : undefined} className={`${linkClassName} mt-1 ${homeActive ? "border-cyan-600 bg-cyan-50 text-cyan-900" : "border-transparent text-slate-700 hover:bg-slate-100 hover:text-cyan-800"}`} href="/console">
          我的工作台
        </Link>
      </section>
      {groups.map((group) => (
        <section aria-labelledby={`console-${group.key}-nav`} key={group.key}>
          <p className="hidden px-3 text-[11px] font-semibold tracking-[0.14em] text-slate-400 lg:block" id={`console-${group.key}-nav`}>{group.label}</p>
          <div className="flex gap-1 lg:mt-1 lg:block lg:space-y-1">
            {group.modules.map((link) => {
              const isActive = isConsoleRouteActive(pathname, link.href);
              return (
                <Link aria-current={isActive ? "page" : undefined} className={`${linkClassName} ${isActive ? "border-cyan-600 bg-cyan-50 text-cyan-900" : "border-transparent text-slate-700 hover:bg-slate-100 hover:text-cyan-800"}`} href={link.href} key={link.key}>
                  {link.label === "采购申请" ? "采购事务" : link.label === "用户管理" ? "成员管理" : link.label}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </nav>
  );
}
