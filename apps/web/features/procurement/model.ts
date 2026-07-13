export type ProcurementStatus = "draft" | "submitted" | "approved" | "rejected" | "purchasing" | "purchased" | "received" | "closed" | "cancelled";
export type ProcurementAction = "approve" | "reject" | "start_purchase" | "mark_purchased" | "mark_received" | "close" | "cancel";

export type ProcurementCapabilities = {
  create: boolean; readOwn: boolean; readAll: boolean; review: boolean; purchase: boolean; close: boolean;
};

export function procurementCapabilities(permissions: string[]): ProcurementCapabilities {
  const available = new Set(permissions);
  return {
    create: available.has("procurements.create"),
    readOwn: available.has("procurements.read_own"),
    readAll: available.has("procurements.read_all"),
    review: available.has("procurements.review"),
    purchase: available.has("procurements.purchase"),
    close: available.has("procurements.close"),
  };
}

export function availableActions(status: ProcurementStatus, capability: ProcurementCapabilities, isRequester: boolean) {
  const actions: Array<{ action: ProcurementAction; label: string }> = [];
  if (status === "submitted" && capability.review) actions.push({ action: "approve", label: "批准" }, { action: "reject", label: "驳回" });
  if (status === "approved" && capability.purchase) actions.push({ action: "start_purchase", label: "开始采购" });
  if (status === "purchasing" && capability.purchase) actions.push({ action: "mark_purchased", label: "标记已采购" });
  if (status === "purchased" && capability.purchase) actions.push({ action: "mark_received", label: "确认到货" });
  if (status === "received" && capability.close) actions.push({ action: "close", label: "关闭申请" });
  if (status === "submitted" && isRequester) actions.push({ action: "cancel", label: "撤回申请" });
  return actions;
}
