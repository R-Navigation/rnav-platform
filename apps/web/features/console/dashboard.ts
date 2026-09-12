import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";
import { normalizeConsoleDashboard, type ConsoleDashboard } from "@/features/console/dashboard-model";
import { getInternalApiUrl } from "@/lib/server/api";

export type ConsoleDashboardResult =
  | { data: ConsoleDashboard; status: "ready" }
  | { message: string; status: "error" };

export const getConsoleDashboard = cache(async (): Promise<ConsoleDashboardResult> => {
  const cookieStore = await cookies();
  try {
    const response = await fetch(getInternalApiUrl("/api/console/dashboard"), {
      headers: { cookie: cookieStore.toString() },
      cache: "no-store",
    });
    if (!response.ok) {
      return { status: "error", message: `工作台服务返回了意外状态（${response.status}）。` };
    }
    return { status: "ready", data: normalizeConsoleDashboard(await response.json()) };
  } catch {
    return { status: "error", message: "暂时无法加载工作台事务，请稍后重试。" };
  }
});
