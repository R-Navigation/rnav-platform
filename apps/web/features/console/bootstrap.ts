import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";
import type { ConsoleNavigationModule } from "@/features/console/navigation";
import { getInternalApiUrl } from "@/lib/server/api";

export type ConsoleTier = "normal" | "plus" | "super";

export type ConsoleBootstrap = {
  consoleModules: ConsoleNavigationModule[];
  permissions: string[];
  user: {
    displayName: string;
    id: string;
    tier: ConsoleTier;
    username: string;
    mustChangePassword: boolean;
  };
};

export type ConsoleBootstrapResult =
  | { data: ConsoleBootstrap; status: "authenticated" }
  | { status: "anonymous" }
  | { status: "forbidden" }
  | { message: string; status: "error" };

function isConsoleBootstrap(value: unknown): value is ConsoleBootstrap {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ConsoleBootstrap>;
  return Boolean(
    candidate.user &&
      typeof candidate.user.id === "string" &&
      typeof candidate.user.username === "string" &&
      typeof candidate.user.displayName === "string" &&
      typeof candidate.user.mustChangePassword === "boolean" &&
      ["normal", "plus", "super"].includes(candidate.user.tier ?? "") &&
      Array.isArray(candidate.permissions) &&
      Array.isArray(candidate.consoleModules),
  );
}

export const getConsoleBootstrap = cache(async (): Promise<ConsoleBootstrapResult> => {
  const cookieStore = await cookies();

  try {
    const response = await fetch(getInternalApiUrl("/api/console/bootstrap"), {
      headers: { cookie: cookieStore.toString() },
      cache: "no-store",
    });

    if (response.status === 401) {
      return { status: "anonymous" };
    }
    if (response.status === 403) {
      return { status: "forbidden" };
    }
    if (!response.ok) {
      return {
        status: "error",
        message: `控制台服务返回了意外状态（${response.status}）。`,
      };
    }

    const data: unknown = await response.json();
    if (!isConsoleBootstrap(data)) {
      return { status: "error", message: "控制台服务返回的数据格式无效。" };
    }

    return { status: "authenticated", data };
  } catch {
    return { status: "error", message: "暂时无法连接控制台服务，请稍后重试。" };
  }
});
