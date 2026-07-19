export type ProcurementStatus = "draft" | "submitted" | "approved" | "rejected" | "purchasing" | "purchased" | "received" | "closed" | "cancelled";
export type ProcurementAction = "approve" | "reject" | "start_purchase" | "mark_purchased" | "mark_received" | "close" | "cancel";
export type CatalogAttribute = { id: string; subcategoryId: string; attributeKey: string; labelZh: string; labelEn: string; unit: string; valueType: "text" | "number" | "multi"; sortOrder: number; isFilterable: boolean; values: string[] };
export type CatalogSubcategory = { id: string; categoryId: string; code: string; nameZh: string; nameEn: string; descriptionZh: string; descriptionEn: string; sortOrder: number; isActive: boolean; attributes?: CatalogAttribute[] };
export type CatalogItem = { id: string; categoryId: string; categoryCode: string; categoryNameZh: string; subcategoryId: string; subcategoryCode: string; subcategoryNameZh: string; sku: string | null; nameZh: string; nameEn: string; spec: string; specMetadata: Record<string, string | number | boolean | null | string[]>; unit: string; packSize: number; estimatedUnitPrice: number | null; vendor: string | null; url: string | null; keywords: string[]; imageAssetId: string | null; imageUrl: string | null; isActive: boolean };
export type ProcurementCatalogSnapshot = { categoryNameZh?: string; subcategoryNameZh?: string; specMetadata?: CatalogItem["specMetadata"]; url?: string };
export type GroupableProcurementItem = { source_type?: "catalog" | "custom"; catalog_snapshot?: ProcurementCatalogSnapshot };
export type CustomItemDraft = { itemName: string; spec: string; unit: string; quantity: number; estimatedUnitPrice: number | null; vendor: string | null; url: string | null; remark: string | null };
export type CartItem =
  | { key: string; sourceType: "catalog"; catalogItemId: string; name: string; spec: string; unit: string; packSize: number; quantity: number; estimatedUnitPrice: number | null; remark: string; url: string | null }
  | ({ key: string; sourceType: "custom" } & CustomItemDraft);

export type ProcurementCapabilities = { create: boolean; readOwn: boolean; readAll: boolean; review: boolean; purchase: boolean; close: boolean };
export type ProcessingDraftState = { status: "pending" | "purchased" | "rejected"; rejectionReason: string };
export type ProcessingSpendingDraft = { scope: "items" | "request_total"; amount: string; itemIds: string[] };

export function procurementCapabilities(permissions: string[]): ProcurementCapabilities { const available=new Set(permissions);return{create:available.has("procurements.create"),readOwn:available.has("procurements.read_own"),readAll:available.has("procurements.read_all"),review:available.has("procurements.review"),purchase:available.has("procurements.purchase"),close:available.has("procurements.close")}; }

export function availableActions(status: ProcurementStatus, capability: ProcurementCapabilities, isRequester: boolean) { const actions:Array<{action:ProcurementAction;label:string}>=[];if(status==="submitted"&&isRequester)actions.push({action:"cancel",label:"撤回申请"});if(status==="submitted"&&capability.review&&!capability.purchase)actions.push({action:"approve",label:"批准"},{action:"reject",label:"驳回"});return actions; }

export function addCatalogItem(cart: CartItem[], item: CatalogItem, quantity = item.packSize): CartItem[] { const key=`catalog:${item.id}`,existing=cart.find((entry)=>entry.key===key);if(existing?.sourceType==="catalog")return cart.map((entry)=>entry.key===key?{...existing,quantity:existing.quantity+quantity}:entry);return[...cart,{key,sourceType:"catalog",catalogItemId:item.id,name:item.nameZh,spec:item.spec,unit:item.unit,packSize:item.packSize,quantity,estimatedUnitPrice:item.estimatedUnitPrice,remark:"",url:item.url}]; }
export function updateCartQuantity(cart: CartItem[], key: string, quantity: number) { return quantity<=0?cart.filter((entry)=>entry.key!==key):cart.map((entry)=>entry.key===key?{...entry,quantity}:entry); }
export function cartEstimatedTotal(cart: CartItem[]) { return cart.reduce((sum,item)=>sum+item.quantity*(item.estimatedUnitPrice??0),0); }

const hiddenAttributeKeys=new Set(["source","sourceSku","optionSku","productFamily","rawOptionValues","packUnit"]);
const fallbackLabels:Record<string,string>={thread:"尺寸",lengthMm:"长度",headDiameterMm:"螺头直径",bodyLengthMm:"柱体长度",maleThreadLengthMm:"外螺纹长度",hexWidthMm:"对边尺寸",outerDiameterMm:"外径",thicknessMm:"厚度",threadPitchMm:"螺距",material:"材料",variants:"特性",standard:"标准",packQuantity:"每包数量",brand:"品牌",leadTime:"货期"};
const unitByKey:Record<string,string>={lengthMm:"mm",headDiameterMm:"mm",bodyLengthMm:"mm",maleThreadLengthMm:"mm",hexWidthMm:"mm",outerDiameterMm:"mm",thicknessMm:"mm",threadPitchMm:"mm",packQuantity:"个"};
export function displayAttributes(metadata: CatalogItem["specMetadata"], definitions: CatalogAttribute[] = []) { const definitionMap=new Map(definitions.map((item)=>[item.attributeKey,item]));return Object.entries(metadata).filter(([key,value])=>!hiddenAttributeKeys.has(key)&&value!==null&&value!==""&&(!Array.isArray(value)||value.length)).map(([key,value])=>({key,label:definitionMap.get(key)?.labelZh??fallbackLabels[key]??key,value:Array.isArray(value)?value.join("、"):String(value),unit:definitionMap.get(key)?.unit??unitByKey[key]??"",sortOrder:definitionMap.get(key)?.sortOrder??999})).sort((a,b)=>a.sortOrder-b.sortOrder||a.label.localeCompare(b.label,"zh-CN")); }

export function groupProcurementItems<T extends GroupableProcurementItem>(items: T[]) {
  const groups = new Map<string, Map<string, T[]>>();
  for (const item of items) {
    const category = item.catalog_snapshot?.categoryNameZh || "其他物料";
    const subcategory = item.catalog_snapshot?.subcategoryNameZh || (item.source_type === "custom" ? "手动填写" : "未分类");
    const subcategories = groups.get(category) ?? new Map<string, T[]>();
    const groupedItems = subcategories.get(subcategory) ?? [];
    groupedItems.push(item);
    subcategories.set(subcategory, groupedItems);
    groups.set(category, subcategories);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "zh-CN"))
    .map(([category, subcategories]) => ({
      category,
      subcategories: [...subcategories.entries()]
        .sort(([left], [right]) => left.localeCompare(right, "zh-CN"))
        .map(([subcategory, groupedItems]) => ({ subcategory, items: groupedItems })),
    }));
}

export function processingCompletionBlockers(
  itemIds: string[],
  draft: Record<string, ProcessingDraftState>,
  spending: ProcessingSpendingDraft[],
) {
  const blockers: string[] = [];
  const pendingCount = itemIds.filter((id) => (draft[id]?.status ?? "pending") === "pending").length;
  if (!itemIds.length) blockers.push("采购清单中没有可处理的条目。");
  if (pendingCount) blockers.push(`还有 ${pendingCount} 个条目未标记为已购买或已驳回。`);
  return [...blockers, ...processingSaveBlockers(itemIds, draft, spending)];
}

export function processingSaveBlockers(
  itemIds: string[],
  draft: Record<string, ProcessingDraftState>,
  spending: ProcessingSpendingDraft[],
) {
  const missingReasons = itemIds.filter((id) => draft[id]?.status === "rejected" && !draft[id]?.rejectionReason.trim()).length;
  return [
    ...(missingReasons ? [`还有 ${missingReasons} 个已驳回条目未填写驳回意见。`] : []),
    ...processingSpendingBlockers(draft, spending),
  ];
}

export function processingSpendingBlockers(
  draft: Record<string, ProcessingDraftState>,
  spending: ProcessingSpendingDraft[],
) {
  const blockers: string[] = [];
  const invalidAmounts = spending.filter((entry) => {
    const amount = Number(entry.amount);
    return entry.amount === "" || !Number.isFinite(amount) || amount < 0 || Math.abs(Math.round(amount * 100) - amount * 100) >= 1e-8;
  }).length;
  const requestTotals = spending.filter((entry) => entry.scope === "request_total");
  const billedItemIds = spending.flatMap((entry) => entry.scope === "items" ? entry.itemIds : []);
  const duplicateBilling = new Set(billedItemIds).size !== billedItemIds.length;
  const invalidBilling = billedItemIds.some((id) => draft[id]?.status !== "purchased");
  const hasPurchasedItems = Object.values(draft).some((item) => item.status === "purchased");
  if (invalidAmounts) blockers.push(`还有 ${invalidAmounts} 条实际金额未填写或格式不正确。`);
  if (requestTotals.length && spending.length !== 1) blockers.push("整单总额不能与按条目金额同时记录。");
  if (requestTotals.length && !hasPurchasedItems) blockers.push("没有已购买条目时不能记录整单实际金额。");
  if (duplicateBilling) blockers.push("同一个条目不能重复计入多笔实际金额。");
  if (invalidBilling) blockers.push("实际金额只能关联已购买的条目。");
  return blockers;
}
