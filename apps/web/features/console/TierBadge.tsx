import type { ConsoleTier } from "@/features/console/bootstrap";

const tierLabels: Record<ConsoleTier, string> = {
  normal: "普通成员",
  plus: "进阶成员",
  super: "超级管理员",
};

export function TierBadge({ tier }: { tier: ConsoleTier }) {
  return (
    <span className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold text-cyan-800">
      {tierLabels[tier]}
    </span>
  );
}
