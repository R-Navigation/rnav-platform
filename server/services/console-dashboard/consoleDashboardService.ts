import type { Pool } from "pg";
import type { AuthenticatedUser } from "../../middleware/auth.js";
import { deriveDisplayTier, type DisplayTier } from "../auth/permissions.js";

export type ConsoleDashboardRecentItem = {
  href: string;
  id: string;
  status: string;
  title: string;
  type: "procurement" | "lab_usage";
  updatedAt: string;
};

export type ConsoleDashboard = {
  user: {
    id: string;
    displayName: string;
    tier: DisplayTier;
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
  recentItems: ConsoleDashboardRecentItem[];
};

type DashboardPool = Pick<Pool, "query">;

type MetricRow = {
  assets_in_use: string | number;
  lab_usage_open: string | number;
  lab_usage_reviews: string | number;
  procurement_open: string | number;
  procurement_purchases: string | number;
  procurement_reviews: string | number;
};

type RecentRow = {
  href: string;
  id: string;
  status: string;
  title: string;
  type: ConsoleDashboardRecentItem["type"];
  updated_at: Date | string;
};

const roleDefinitions: Array<{ label: string; permissions: string[] }> = [
  { label: "资产管理员", permissions: ["lab_assets.write"] },
  { label: "采购审批", permissions: ["procurements.review"] },
  { label: "采购执行", permissions: ["procurements.purchase", "procurements.close"] },
  { label: "官网编辑", permissions: ["site.content.write", "site.members.write", "site.media.write"] },
  { label: "监控管理员", permissions: ["monitor.devices.write", "monitor.settings.write"] },
  { label: "成员管理员", permissions: ["users.write", "permissions.write"] },
  { label: "系统管理员", permissions: ["system.settings.write"] },
];

export function getDashboardRoleLabels(user: AuthenticatedUser) {
  if (user.baseTier === "super") return ["超级管理员"];
  const permissions = new Set(user.permissions);
  const labels = roleDefinitions
    .filter((role) => role.permissions.some((permission) => permissions.has(permission)))
    .map((role) => role.label);
  return labels.length ? labels : ["普通成员"];
}

function numeric(value: string | number | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function createConsoleDashboardService(pool: DashboardPool) {
  return {
    async getDashboard(user: AuthenticatedUser): Promise<ConsoleDashboard> {
      const permissions = new Set(user.permissions);
      const canReviewProcurements = permissions.has("procurements.review");
      const canPurchase = permissions.has("procurements.purchase");
      const canReviewLabUsage = permissions.has("lab_assets.write");

      const [metricsResult, recentResult] = await Promise.all([
        pool.query<MetricRow>(
          `SELECT
             (SELECT count(*) FROM procurement_requests
              WHERE requester_id=$1
                AND status IN ('submitted','approved','purchasing','purchased','received')) procurement_open,
             (SELECT count(*) FROM lab_asset_usage_requests
              WHERE requester_id=$1 AND status='pending') lab_usage_open,
             (SELECT count(*) FROM lab_assets
              WHERE assigned_user_id=$1 AND status='in_use') assets_in_use,
             CASE WHEN $2::boolean THEN
               (SELECT count(*) FROM procurement_requests
                WHERE status='submitted' AND requester_id<>$1)
             ELSE 0 END procurement_reviews,
             CASE WHEN $3::boolean THEN
               (SELECT count(*) FROM procurement_requests
                WHERE status IN ('approved','purchasing'))
             ELSE 0 END procurement_purchases,
             CASE WHEN $4::boolean THEN
               (SELECT count(*) FROM lab_asset_usage_requests WHERE status='pending')
             ELSE 0 END lab_usage_reviews`,
          [user.id, canReviewProcurements, canPurchase, canReviewLabUsage],
        ),
        pool.query<RecentRow>(
          `WITH visible_procurements AS (
             SELECT requests.id,
                    'procurement'::text type,
                    requests.title,
                    requests.status,
                    '/console/procurements'::text href,
                    requests.updated_at
             FROM procurement_requests requests
             WHERE requests.requester_id=$1
                OR ($2::boolean AND requests.status='submitted' AND requests.requester_id<>$1)
                OR ($3::boolean AND requests.status IN ('approved','purchasing'))
           ), visible_usage AS (
             SELECT usage.id,
                    'lab_usage'::text type,
                    '设备使用申请 · ' || COALESCE(NULLIF(assets.name_zh,''), NULLIF(assets.name_en,''), assets.code) title,
                    usage.status,
                    '/console/lab-assets'::text href,
                    usage.updated_at
             FROM lab_asset_usage_requests usage
             JOIN lab_assets assets ON assets.id=usage.asset_id
             WHERE usage.requester_id=$1
                OR ($4::boolean AND usage.status='pending')
           )
           SELECT * FROM (
             SELECT * FROM visible_procurements
             UNION ALL
             SELECT * FROM visible_usage
           ) recent
           ORDER BY updated_at DESC
           LIMIT 8`,
          [user.id, canReviewProcurements, canPurchase, canReviewLabUsage],
        ),
      ]);

      const metrics = metricsResult.rows[0];
      return {
        user: {
          id: user.id,
          displayName: user.displayName || user.username,
          tier: deriveDisplayTier(user.baseTier, user.permissions),
          roleLabels: getDashboardRoleLabels(user),
        },
        tasks: {
          procurementReviews: canReviewProcurements ? numeric(metrics?.procurement_reviews) : 0,
          procurementPurchases: canPurchase ? numeric(metrics?.procurement_purchases) : 0,
          labUsageReviews: canReviewLabUsage ? numeric(metrics?.lab_usage_reviews) : 0,
        },
        mine: {
          procurementOpen: numeric(metrics?.procurement_open),
          labUsageOpen: numeric(metrics?.lab_usage_open),
          assetsInUse: numeric(metrics?.assets_in_use),
        },
        recentItems: recentResult.rows.map((item) => ({
          href: item.href,
          id: item.id,
          status: item.status,
          title: item.title,
          type: item.type,
          updatedAt: new Date(item.updated_at).toISOString(),
        })),
      };
    },
  };
}

export type ConsoleDashboardService = ReturnType<typeof createConsoleDashboardService>;
