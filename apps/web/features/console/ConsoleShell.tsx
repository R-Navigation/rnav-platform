"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ConsoleTier } from "./bootstrap";
import type { ConsoleNavigationModule } from "./navigation";
import { ConsoleSidebarNav } from "./ConsoleSidebarNav";
import { NotificationBell } from "./NotificationBell";
import { TierBadge } from "./TierBadge";
import { ConsoleIcon } from "./ui/ConsoleIcon";

type ShellUser = { displayName: string; username: string; tier: ConsoleTier };

export function ConsoleShell({ modules, user, children }: { modules: ConsoleNavigationModule[]; user: ShellUser; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setSidebarOpen(false); setUserOpen(false); }, [pathname]);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!userMenuRef.current?.contains(event.target as Node)) setUserOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { setSidebarOpen(false); setUserOpen(false); } };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", key); };
  }, []);
  useEffect(() => { document.body.style.overflow = sidebarOpen ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [sidebarOpen]);

  const currentLabel = useMemo(() => modules.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.label || "我的工作台", [modules, pathname]);
  const initials = (user.displayName || user.username).trim().slice(0, 2).toUpperCase();
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); router.refresh(); }

  const sidebar = <><div className="flex h-14 items-center gap-3 border-b border-slate-200 px-4"><span className="grid size-8 place-items-center rounded-lg bg-cyan-700 text-xs font-black tracking-tight text-white">RN</span><Link className="leading-tight" href="/console"><span className="block text-sm font-bold tracking-tight text-slate-950">RNAV</span><span className="block text-[10px] text-slate-400">实验室工作台</span></Link></div><ConsoleSidebarNav modules={modules}/></>;

  return <div className="console-root min-h-screen bg-[#f7f8fa] text-slate-900 lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
    <a className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-lg bg-slate-950 px-4 py-2 text-sm text-white focus:translate-y-0" href="#console-content">跳到主要内容</a>
    <aside className="hidden min-h-screen flex-col border-r border-slate-200 bg-white lg:flex">{sidebar}</aside>
    {sidebarOpen ? <div aria-modal="true" className="fixed inset-0 z-[70] bg-slate-950/35 lg:hidden" onMouseDown={(event) => { if (event.target === event.currentTarget) setSidebarOpen(false); }} role="dialog"><aside className="flex h-full w-[min(248px,calc(100vw-3rem))] flex-col bg-white shadow-2xl"><div className="absolute left-[min(252px,calc(100vw-2.75rem))] top-2"><button aria-label="关闭导航" className="grid size-10 place-items-center rounded-lg text-white hover:bg-white/10" onClick={() => setSidebarOpen(false)}><ConsoleIcon className="size-5" name="close"/></button></div>{sidebar}</aside></div> : null}
    <div className="min-w-0">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
        <button aria-label="打开导航" className="grid size-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setSidebarOpen(true)}><ConsoleIcon className="size-5" name="menu"/></button>
        <nav aria-label="面包屑" className="min-w-0 flex-1 truncate text-sm"><Link className="text-slate-400 hover:text-slate-700" href="/console">控制台</Link><span className="mx-2 text-slate-300">/</span><span className="font-medium text-slate-700">{currentLabel}</span></nav>
        <button aria-label="搜索控制台" className="hidden h-9 w-48 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-left text-xs text-slate-400 hover:border-slate-300 hover:bg-white sm:flex" title="全局搜索即将开放"><ConsoleIcon className="size-4" name="search"/><span className="flex-1">搜索…</span><kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-sans text-[10px] text-slate-400">⌘K</kbd></button>
        <NotificationBell/>
        <div className="relative" ref={userMenuRef}><button aria-expanded={userOpen} aria-label="打开用户菜单" className="flex h-9 items-center gap-2 rounded-lg px-1.5 hover:bg-slate-100" onClick={() => setUserOpen((value) => !value)}><span className="grid size-7 place-items-center rounded-full bg-slate-800 text-[10px] font-bold text-white">{initials}</span><ConsoleIcon className="hidden size-3 text-slate-400 sm:block" name="chevron-down"/></button>{userOpen ? <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"><div className="border-b border-slate-100 px-3 py-2"><p className="truncate text-sm font-semibold text-slate-900">{user.displayName || user.username}</p><p className="mb-2 truncate text-xs text-slate-500">@{user.username}</p><TierBadge tier={user.tier}/></div><Link className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100" href="/console/profile"><ConsoleIcon name="user"/>个人资料</Link><Link className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100" href="/"><ConsoleIcon name="external"/>返回网站</Link><button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50" onClick={() => void logout()}><ConsoleIcon name="logout"/>退出登录</button></div> : null}</div>
      </header>
      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8" id="console-content">{children}</main>
    </div>
  </div>;
}
