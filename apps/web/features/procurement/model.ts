export type ProcurementStatus = "draft" | "submitted" | "approved" | "rejected" | "purchasing" | "purchased" | "received" | "closed" | "cancelled";
export type ProcurementAction = "approve" | "reject" | "start_purchase" | "mark_purchased" | "mark_received" | "close" | "cancel";
export type CatalogItem = { id: string; categoryId: string; categoryCode: string; categoryNameZh: string; sku: string | null; nameZh: string; nameEn: string; spec: string; specMetadata: Record<string, string | number | boolean | null>; unit: string; packSize: number; estimatedUnitPrice: number | null; vendor: string | null; url: string | null; keywords: string[]; imageAssetId: string | null; isActive: boolean };
export type CustomItemDraft = { itemName: string; spec: string; unit: string; quantity: number; estimatedUnitPrice: number | null; vendor: string | null; url: string | null; remark: string | null };
export type CartItem =
  | { key: string; sourceType: "catalog"; catalogItemId: string; name: string; spec: string; unit: string; packSize: number; quantity: number; estimatedUnitPrice: number | null; remark: string }
  | ({ key: string; sourceType: "custom" } & CustomItemDraft);

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

export function addCatalogItem(cart: CartItem[], item: CatalogItem, quantity = item.packSize): CartItem[] {
  const key = `catalog:${item.id}`;
  const existing = cart.find((entry) => entry.key === key);
  if (existing?.sourceType === "catalog") return cart.map((entry) => entry.key === key ? { ...existing, quantity: existing.quantity + quantity } : entry);
  const line: CartItem = { key, sourceType: "catalog", catalogItemId: item.id, name: item.nameZh, spec: item.spec, unit: item.unit, packSize: item.packSize, quantity, estimatedUnitPrice: item.estimatedUnitPrice, remark: "" };
  return [...cart, line];
}

export function updateCartQuantity(cart: CartItem[], key: string, quantity: number) {
  return quantity <= 0 ? cart.filter((entry) => entry.key !== key) : cart.map((entry) => entry.key === key ? { ...entry, quantity } : entry);
}

export function cartEstimatedTotal(cart: CartItem[]) {
  return cart.reduce((sum, item) => sum + item.quantity * (item.estimatedUnitPrice ?? 0), 0);
}
