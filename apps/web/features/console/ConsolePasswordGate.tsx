"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

export function ConsolePasswordGate({ children, required }: { children: ReactNode; required: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (required && pathname !== "/console/profile") router.replace("/console/profile?section=security");
  }, [pathname, required, router]);
  if (required && pathname !== "/console/profile") return <p className="text-sm text-slate-600">正在前往账号安全页面...</p>;
  return children;
}
