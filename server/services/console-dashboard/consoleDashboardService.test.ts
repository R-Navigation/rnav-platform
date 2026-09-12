import assert from "node:assert/strict";
import test from "node:test";
import type { AuthenticatedUser } from "../../middleware/auth.js";
import {
  createConsoleDashboardService,
  getDashboardRoleLabels,
} from "./consoleDashboardService.js";

function user(permissions: string[] = [], baseTier: "normal" | "super" = "normal") {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    username: "alice",
    displayName: "张三",
    baseTier,
    permissions,
  } satisfies AuthenticatedUser;
}

function serviceWithRows(metrics: Record<string, string | number>, recent: Record<string, unknown>[] = []) {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const pool = {
    async query(text: string, values: unknown[]) {
      calls.push({ text, values });
      return calls.length === 1 ? { rows: [metrics] } : { rows: recent };
    },
  };
  return { calls, service: createConsoleDashboardService(pool as never) };
}

test("normal dashboard returns personal work while suppressing every administrator task", async () => {
  const { calls, service } = serviceWithRows({
    procurement_open: "2",
    lab_usage_open: "1",
    assets_in_use: "3",
    procurement_reviews: "99",
    procurement_purchases: "99",
    lab_usage_reviews: "99",
  });

  const dashboard = await service.getDashboard(user([
    "console.access",
    "lab_assets.read",
    "procurements.read_own",
  ]));

  assert.deepEqual(dashboard.tasks, {
    procurementReviews: 0,
    procurementPurchases: 0,
    labUsageReviews: 0,
    incompleteProfiles: 0,
    staleProfiles: 0,
  });
  assert.deepEqual(dashboard.mine, {
    procurementOpen: 2,
    labUsageOpen: 1,
    assetsInUse: 3,
  });
  assert.deepEqual(calls[0].values.slice(1), [false, false, false, false]);
  assert.deepEqual(calls[1].values.slice(1), [false, false, false]);
});

test("dashboard exposes only the task counters enabled by effective permissions", async () => {
  const { calls, service } = serviceWithRows({
    procurement_open: 0,
    lab_usage_open: 0,
    assets_in_use: 0,
    procurement_reviews: 4,
    procurement_purchases: 5,
    lab_usage_reviews: 6,
  });

  const dashboard = await service.getDashboard(user([
    "procurements.review",
    "lab_assets.write",
  ]));

  assert.deepEqual(dashboard.tasks, {
    procurementReviews: 4,
    procurementPurchases: 0,
    labUsageReviews: 6,
    incompleteProfiles: 0,
    staleProfiles: 0,
  });
  assert.deepEqual(calls[0].values.slice(1), [true, false, true, false]);
  assert.deepEqual(dashboard.user.roleLabels, ["资产管理员", "采购审批"]);
});

test("dashboard normalizes recent items and super role labels", async () => {
  const { service } = serviceWithRows({
    procurement_open: 0,
    lab_usage_open: 0,
    assets_in_use: 0,
    procurement_reviews: 0,
    procurement_purchases: 0,
    lab_usage_reviews: 0,
  }, [{
    id: "request-1",
    type: "procurement",
    title: "采购相机",
    status: "submitted",
    href: "/console/procurements",
    updated_at: "2026-09-12T12:30:00.000Z",
  }]);

  const dashboard = await service.getDashboard(user([], "super"));
  assert.equal(dashboard.recentItems[0].updatedAt, "2026-09-12T12:30:00.000Z");
  assert.deepEqual(dashboard.user.roleLabels, ["超级管理员"]);
  assert.deepEqual(getDashboardRoleLabels(user()), ["普通成员"]);
});
