"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  isConsoleRouteActive,
  type ConsoleNavigationModule,
} from "@/features/console/navigation";

type ConsoleSidebarNavProps = {
  modules: ConsoleNavigationModule[];
};

const linkClassName =
  "block whitespace-nowrap px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-cyan-800";

export function ConsoleSidebarNav({ modules }: ConsoleSidebarNavProps) {
  const pathname = usePathname();
  const links = [{ href: "/console", key: "console-home", label: "控制台首页" }, ...modules];

  return (
    <nav
      aria-label="控制台模块"
      className="flex gap-1 overflow-x-auto px-3 py-3 lg:block lg:space-y-1 lg:overflow-visible"
    >
      {links.map((link) => {
        const isActive = isConsoleRouteActive(pathname, link.href);
        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={linkClassName}
            href={link.href}
            key={link.key}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
