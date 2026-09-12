import type { ConsoleTier } from "@/features/console/bootstrap";

export type ConsoleDashboard = {
  user: {
    id: string;
    displayName: string;
    tier: ConsoleTier;
    roleLabels: string[];
  };
  tasks: {
    procurementReviews: number;
    procurementPurchases: number;
    labUsageReviews: number;
  };
  mine: {
    procurementOpen: number;
    labUsageOpen: number;
    assetsInUse: number;
  };
  recentItems: Array<{
    id: string;
    type: "procurement" | "lab_usage";
    title: string;
    status: string;
    href: string;
    updatedAt: string;
  }>;
};

function object(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("控制台工作台数据格式无效。");
  }
  return value as Record<string, unknown>;
}

function count(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error("控制台工作台数据格式无效。");
  }
  return value;
}

export function normalizeConsoleDashboard(value: unknown): ConsoleDashboard {
  const dashboard = object(value);
  const user = object(dashboard.user);
  const tasks = object(dashboard.tasks);
  const mine = object(dashboard.mine);
  if (
    typeof user.id !== "string" ||
    typeof user.displayName !== "string" ||
    !["normal", "plus", "super"].includes(String(user.tier)) ||
    !Array.isArray(user.roleLabels) ||
    !user.roleLabels.every((label) => typeof label === "string") ||
    !Array.isArray(dashboard.recentItems)
  ) {
    throw new Error("控制台工作台数据格式无效。");
  }

  return {
    user: {
      id: user.id,
      displayName: user.displayName,
      tier: user.tier as ConsoleTier,
      roleLabels: user.roleLabels,
    },
    tasks: {
      procurementReviews: count(tasks.procurementReviews),
      procurementPurchases: count(tasks.procurementPurchases),
      labUsageReviews: count(tasks.labUsageReviews),
    },
    mine: {
      procurementOpen: count(mine.procurementOpen),
      labUsageOpen: count(mine.labUsageOpen),
      assetsInUse: count(mine.assetsInUse),
    },
    recentItems: dashboard.recentItems.map((value) => {
      const item = object(value);
      if (
        typeof item.id !== "string" ||
        !["procurement", "lab_usage"].includes(String(item.type)) ||
        typeof item.title !== "string" ||
        typeof item.status !== "string" ||
        typeof item.href !== "string" ||
        !item.href.startsWith("/console/") ||
        typeof item.updatedAt !== "string"
      ) {
        throw new Error("控制台工作台数据格式无效。");
      }
      return item as ConsoleDashboard["recentItems"][number];
    }),
  };
}
