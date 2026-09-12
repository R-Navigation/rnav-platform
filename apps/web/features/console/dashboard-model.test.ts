import assert from "node:assert/strict";
import test from "node:test";
import { normalizeConsoleDashboard } from "./dashboard-model.ts";

const dashboard = {
  user: { id: "user-1", displayName: "张三", tier: "plus", roleLabels: ["采购审批"] },
  tasks: { procurementReviews: 2, procurementPurchases: 0, labUsageReviews: 0 },
  mine: { procurementOpen: 1, labUsageOpen: 1, assetsInUse: 2 },
  recentItems: [{
    id: "request-1",
    type: "procurement",
    title: "采购相机",
    status: "submitted",
    href: "/console/procurements",
    updatedAt: "2026-09-12T12:30:00.000Z",
  }],
};

test("normalizes a complete role-aware dashboard payload", () => {
  const result = normalizeConsoleDashboard(dashboard);
  assert.equal(result.tasks.procurementReviews, 2);
  assert.equal(result.recentItems[0].type, "procurement");
});

test("rejects negative counters and links outside the console", () => {
  assert.throws(() => normalizeConsoleDashboard({
    ...dashboard,
    tasks: { ...dashboard.tasks, procurementReviews: -1 },
  }));
  assert.throws(() => normalizeConsoleDashboard({
    ...dashboard,
    recentItems: [{ ...dashboard.recentItems[0], href: "https://example.com" }],
  }));
});
