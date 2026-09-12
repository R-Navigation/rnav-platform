import Link from "next/link";
import type { ConsoleBootstrap } from "@/features/console/bootstrap";
import type { ConsoleDashboardResult } from "@/features/console/dashboard";
import type { ConsoleDashboard } from "@/features/console/dashboard-model";
import { TierBadge } from "@/features/console/TierBadge";
import { ConsoleEmptyState } from "@/features/console/ui/ConsoleEmptyState";
import { ConsolePageHeader } from "@/features/console/ui/ConsolePageHeader";
import { ConsoleStatusBadge } from "@/features/console/ui/ConsoleStatusBadge";
import { ConsoleIcon } from "@/features/console/ui/ConsoleIcon";

const statusLabels: Record<string, string> = {
  submitted: "待审批", approved: "已批准", purchasing: "采购中", purchased: "待收货",
  received: "已到货", closed: "已完成", rejected: "已驳回", cancelled: "已取消", pending: "待处理",
};

function taskTone(status: string) {
  if (["rejected", "cancelled"].includes(status)) return "danger" as const;
  if (["closed", "received"].includes(status)) return "success" as const;
  if (["submitted", "pending", "purchasing"].includes(status)) return "warning" as const;
  return "info" as const;
}

function MetricLink({ count, href, label, detail }: { count: number; href: string; label: string; detail: string }) {
  return (
    <Link className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-cyan-200 hover:shadow-md focus-visible:relative" href={href}>
      <span className="flex items-center justify-between text-xs font-semibold text-slate-500">{label}<ConsoleIcon className="size-3.5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-cyan-700" name="external"/></span>
      <span className="mt-4 flex items-end justify-between gap-3">
        <strong className="font-mono text-3xl font-semibold tabular-nums text-slate-950 group-hover:text-cyan-800">{count}</strong>
        <span className="pb-1 text-right text-[11px] leading-4 text-slate-400">{detail}</span>
      </span>
    </Link>
  );
}

function SectionHeading({ id, title, description }: { id: string; title: string; description: string }) {
  return <div><h2 className="text-base font-semibold tracking-tight text-slate-950" id={id}>{title}</h2><p className="mt-1 text-xs text-slate-500">{description}</p></div>;
}

function DashboardContent({ dashboard, permissions }: { dashboard: ConsoleDashboard; permissions: string[] }) {
  const canReview = permissions.includes("procurements.review");
  const canPurchase = permissions.includes("procurements.purchase");
  const canReviewUsage = permissions.includes("lab_assets.write");
  const canManageMembers=permissions.includes("site.members.write");
  const taskCount = dashboard.tasks.procurementReviews + dashboard.tasks.procurementPurchases + dashboard.tasks.labUsageReviews + dashboard.tasks.incompleteProfiles + dashboard.tasks.staleProfiles;
  const taskCards = [
    canReview ? { count: dashboard.tasks.procurementReviews, href: "/console/procurements?view=review", label: "待审核采购", detail: "查看申请理由与采购清单" } : null,
    canPurchase ? { count: dashboard.tasks.procurementPurchases, href: "/console/procurements?view=purchase", label: "待采购申请", detail: "继续处理已批准采购" } : null,
    canReviewUsage ? { count: dashboard.tasks.labUsageReviews, href: "/console/lab-assets?view=requests", label: "设备申请审批", detail: "处理成员的设备使用申请" } : null,
    canManageMembers ? { count: dashboard.tasks.incompleteProfiles, href: "/console/members?profile=incomplete", label: "资料待完善", detail: "补齐成员官网展示资料" } : null,
    canManageMembers ? { count: dashboard.tasks.staleProfiles, href: "/console/members?profile=stale", label: "年度资料复核", detail: "超过一年未更新的成员资料" } : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  const quickActions = [
    permissions.includes("procurements.create") ? { href: "/console/procurements?view=create", label: "新建采购" } : null,
    permissions.includes("lab_assets.read") ? { href: "/console/lab-assets?view=assets", label: "申请设备" } : null,
    permissions.includes("lab_assets.read") ? { href: "/console/lab-assets", label: "查看资产" } : null,
    permissions.includes("profile.write_own") ? { href: "/console/profile", label: "编辑资料" } : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  return (
    <>
      <ConsolePageHeader
        actions={<TierBadge tier={dashboard.user.tier} />}
        description={taskCount > 0 ? `今天有 ${taskCount} 项事务需要处理。` : "当前没有待处理事务，可以继续推进自己的申请与实验。"}
        eyebrow="我的工作台"
        title={`欢迎，${dashboard.user.displayName}`}
      />
      <div className="mt-4 flex flex-wrap gap-2" aria-label="当前角色">
        {dashboard.user.roleLabels.map((label) => <ConsoleStatusBadge key={label} tone="info">{label}</ConsoleStatusBadge>)}
      </div>

      {taskCards.length ? (
        <section aria-labelledby="dashboard-tasks" className="mt-8">
          <SectionHeading description="需要你审批或执行的实验室事务。" id="dashboard-tasks" title="我的待办" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {taskCards.map((item) => <MetricLink {...item} key={item.label} />)}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="dashboard-mine" className="mt-8">
        <SectionHeading description="与你直接相关、仍在进行中的申请与设备。" id="dashboard-mine" title="我的事务" />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <MetricLink count={dashboard.mine.procurementOpen} detail="进行中的采购申请" href="/console/procurements?scope=mine" label="我的采购" />
          <MetricLink count={dashboard.mine.labUsageOpen} detail="等待处理的设备申请" href="/console/lab-assets?view=requests" label="设备申请" />
          <MetricLink count={dashboard.mine.assetsInUse} detail="当前分配给我的设备" href="/console/lab-assets?view=assets" label="正在使用" />
        </div>
      </section>

      <section aria-labelledby="dashboard-actions" className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <SectionHeading description="从最常用的操作直接开始。" id="dashboard-actions" title="常用操作" />
        <div className="mt-4 flex flex-wrap gap-2">
          {quickActions.map((action, index) => (
            <Link className={index === 0 ? "inline-flex min-h-9 items-center gap-2 rounded-lg bg-cyan-700 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-cyan-800" : "inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"} href={action.href} key={`${action.href}-${action.label}`}>
              {index === 0 ? <ConsoleIcon name="plus"/> : null}{action.label}
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="dashboard-recent" className="mt-8">
        <SectionHeading description="你可查看的采购与设备申请更新。" id="dashboard-recent" title="最近动态" />
        {dashboard.recentItems.length ? (
          <div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {dashboard.recentItems.map((item) => (
              <Link className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-slate-50" href={item.href} key={`${item.type}-${item.id}`}>
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-slate-900">{item.title}</span>
                  <span className="mt-1 block text-xs text-slate-500">{item.type === "procurement" ? "采购事务" : "设备使用"} · {new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(item.updatedAt))}</span>
                </span>
                <ConsoleStatusBadge tone={taskTone(item.status)}>{statusLabels[item.status] ?? item.status}</ConsoleStatusBadge>
              </Link>
            ))}
          </div>
        ) : <div className="mt-5"><ConsoleEmptyState description="提交采购或设备使用申请后，最新进度会显示在这里。" title="还没有最近动态" /></div>}
      </section>
    </>
  );
}

export function ConsoleHome({ bootstrap, dashboard }: { bootstrap: ConsoleBootstrap; dashboard: ConsoleDashboardResult }) {
  if (dashboard.status === "error") {
    return (
      <>
        <ConsolePageHeader description="集中查看待办、个人申请和实验室动态。" eyebrow="我的工作台" title={`欢迎，${bootstrap.user.displayName || bootstrap.user.username}`} />
        <div className="mt-8"><ConsoleEmptyState description={dashboard.message} title="工作台数据暂时不可用" /></div>
      </>
    );
  }
  return <DashboardContent dashboard={dashboard.data} permissions={bootstrap.permissions} />;
}
