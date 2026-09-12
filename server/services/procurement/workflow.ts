export const procurementStatuses = [
  "draft", "submitted", "revision_requested", "approved", "rejected", "purchasing",
  "purchased", "received", "closed", "cancelled",
] as const;

export type ProcurementStatus = (typeof procurementStatuses)[number];
export type ProcurementAction = "request_revision" | "approve" | "reject" | "start_purchase" | "mark_purchased" | "mark_received" | "close" | "cancel";

const transitions: Record<ProcurementAction, Partial<Record<ProcurementStatus, ProcurementStatus>>> = {
  request_revision: { submitted: "revision_requested" },
  approve: { submitted: "approved" },
  reject: { submitted: "rejected" },
  start_purchase: { approved: "purchasing" },
  mark_purchased: { purchasing: "purchased" },
  mark_received: { purchased: "received" },
  close: { received: "closed" },
  cancel: { submitted: "cancelled" },
};

export function validateTransition(status: ProcurementStatus, action: ProcurementAction) {
  const next = transitions[action][status];
  if (!next) throw new Error(`Procurement action ${action} is not allowed from ${status}`);
  return next;
}

export function requiredPermissionForTransition(action: Exclude<ProcurementAction, "cancel">) {
  if (action === "request_revision" || action === "approve" || action === "reject") return "procurements.review";
  if (action === "close") return "procurements.close";
  return "procurements.purchase";
}
