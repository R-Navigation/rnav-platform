"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  groupConsoleModules,
  isConsoleRouteActive,
  type ConsoleNavigationModule,
} from "@/features/console/navigation";
import { ConsoleIcon, type ConsoleIconName } from "@/features/console/ui/ConsoleIcon";

type ConsoleSidebarNavProps = { modules: ConsoleNavigationModule[] };
const linkClassName = "flex min-h-9 items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors";
const icons: Record<string, ConsoleIconName> = { profile: "user", "lab-assets": "asset", procurements: "cart", monitor: "monitor", site: "site", media: "media", members: "users", settings: "settings" };

export function ConsoleSidebarNav({ modules }: ConsoleSidebarNavProps) {
  const pathname = usePathname();
  const groups = groupConsoleModules(modules);
  const homeActive = isConsoleRouteActive(pathname, "/console");

  return (
    <nav aria-label="控制台导航" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      <section aria-labelledby="console-workbench-nav">
        <p className="px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400" id="console-workbench-nav">工作台</p>
        <Link aria-current={homeActive ? "page" : undefined} className={`${linkClassName} mt-1 ${homeActive ? "bg-cyan-50 text-cyan-900" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`} href="/console">
          <ConsoleIcon className="size-4" name="home"/>我的工作台
        </Link>
      </section>
      {groups.map((group) => (
        <section aria-labelledby={`console-${group.key}-nav`} key={group.key}>
          <p className="px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400" id={`console-${group.key}-nav`}>{group.label}</p>
          <div className="mt-1 space-y-1">
            {group.modules.map((link) => {
              const isActive = isConsoleRouteActive(pathname, link.href);
              return (
                <Link aria-current={isActive ? "page" : undefined} className={`${linkClassName} ${isActive ? "bg-cyan-50 text-cyan-900" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`} href={link.href} key={link.key}>
                  <ConsoleIcon className="size-4" name={icons[link.key] || "site"}/>
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
