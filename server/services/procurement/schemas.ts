import { z } from "zod";
import { procurementStatuses } from "./workflow.js";

const text = (maximum: number) => z.string().trim().max(maximum);
const hasAtMostTwoDecimals = (value: number) => Math.abs(Math.round(value * 100) - value * 100) < 1e-8;
const money = (maximum: number) => z.coerce.number().nonnegative().max(maximum).refine(hasAtMostTwoDecimals, "Use at most two decimal places");
const quantity = z.coerce.number().positive().max(1_000_000).refine((value) => Number.isInteger(value * 100), "Use at most two decimal places");
const booleanQuery = z.preprocess((value) => value === true || value === "true", z.boolean());
const nullableText = (maximum: number) => text(maximum).nullable().optional();
const attributeValue = z.union([z.string().max(200), z.number(), z.boolean(), z.null(), z.array(z.string().max(100)).max(20)]);

const attributeFilters = z.preprocess((value) => {
  if (typeof value !== "string" || !value.trim()) return {};
  try { return JSON.parse(value); } catch { return value; }
}, z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/), z.array(z.string().max(100)).min(1).max(50)).refine((value) => Object.keys(value).length <= 12));

export const customProcurementItemSchema = z.object({
  sourceType: z.literal("custom").optional().default("custom"),
  itemName: text(200).min(1),
  spec: text(500).default(""),
  unit: text(40).min(1).default("件"),
  quantity,
  estimatedUnitPrice: money(9_999_999.99).nullable().optional(),
  vendor: nullableText(200),
  url: z.string().url().max(2_000).nullable().optional(),
  remark: nullableText(1_000),
}).strict();

export const catalogProcurementItemSchema = z.object({
  sourceType: z.literal("catalog"),
  catalogItemId: z.string().uuid(),
  quantity,
  remark: nullableText(1_000),
}).strict();

export const procurementItemSchema = z.union([catalogProcurementItemSchema, customProcurementItemSchema]);

export const createProcurementSchema = z.object({
  title: text(200).min(1),
  reason: text(4_000),
  items: z.array(procurementItemSchema).min(1).max(100),
}).strict().refine((value) => value.items.reduce((sum, item) => sum + item.quantity * (item.sourceType === "catalog" ? 0 : item.estimatedUnitPrice ?? 0), 0) <= 9_999_999_999.99, { message: "Total estimated amount exceeds database range", path: ["items"] });

export const procurementListQuerySchema = z.object({
  scope: z.enum(["mine", "all"]).default("mine"),
  status: z.enum(procurementStatuses).optional(),
}).strict();

export const transitionSchema = z.object({
  action: z.enum(["approve", "reject", "start_purchase", "mark_purchased", "mark_received", "close", "cancel"]),
  note: text(2_000).optional().default(""),
}).strict();

export const processingItemSchema = z.object({
  itemId: z.string().uuid(),
  status: z.enum(["pending", "purchased", "rejected"]),
  rejectionReason: text(2_000).nullable().optional(),
}).strict().superRefine((value, context) => {
  if (value.status === "rejected" && !value.rejectionReason) context.addIssue({ code: "custom", path: ["rejectionReason"], message: "Rejected items require a reason" });
});

export const spendingEntrySchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("items"), itemIds: z.array(z.string().uuid()).min(1).max(100), amount: money(9_999_999_999.99), note: text(500).optional().default("") }).strict(),
  z.object({ scope: z.literal("request_total"), amount: money(9_999_999_999.99), note: text(500).optional().default("") }).strict(),
]);

export const processingSaveSchema = z.object({
  items: z.array(processingItemSchema).min(1).max(100).refine((items) => new Set(items.map((item) => item.itemId)).size === items.length, "Duplicate processing items are not allowed"),
  spendingEntries: z.array(spendingEntrySchema).max(100).optional(),
}).strict().superRefine((value, context) => {
  if (!value.spendingEntries) return;
  const requestTotals = value.spendingEntries.filter((entry) => entry.scope === "request_total");
  if (requestTotals.length && value.spendingEntries.length !== 1) context.addIssue({ code: "custom", path: ["spendingEntries"], message: "Request total cannot be combined with item amounts" });
  if (requestTotals.length && !value.items.some((item) => item.status === "purchased")) context.addIssue({ code: "custom", path: ["spendingEntries"], message: "Request total requires at least one purchased item" });
  const itemIds = value.spendingEntries.flatMap((entry) => entry.scope === "items" ? entry.itemIds : []);
  if (new Set(itemIds).size !== itemIds.length) context.addIssue({ code: "custom", path: ["spendingEntries"], message: "Each item can belong to only one spending entry" });
});

export const commentSchema = z.object({ body: text(2_000).min(1) }).strict();
export const procurementIdSchema = z.string().uuid();

export const catalogQuerySchema = z.object({
  search: text(100).optional().default(""),
  categoryId: z.string().uuid().optional(),
  subcategoryId: z.string().uuid().optional(),
  attributes: attributeFilters.optional().default({}),
  includeInactive: booleanQuery.optional().default(false),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
}).strict();

export const catalogAttributeDefinitionSchema = z.object({
  attributeKey: text(80).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  labelZh: text(100).min(1),
  labelEn: text(100).default(""),
  unit: text(40).default(""),
  valueType: z.enum(["text", "number", "multi"]).default("text"),
  sortOrder: z.coerce.number().int().min(-10_000).max(10_000).default(0),
  isFilterable: z.boolean().default(true),
}).strict();

export const catalogSubcategorySchema = z.object({
  categoryId: z.string().uuid(),
  code: text(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  nameZh: text(100).min(1),
  nameEn: text(100).default(""),
  descriptionZh: text(500).default(""),
  descriptionEn: text(500).default(""),
  sortOrder: z.coerce.number().int().min(-10_000).max(10_000).default(0),
  isActive: z.boolean().default(true),
  attributes: z.array(catalogAttributeDefinitionSchema).max(30).default([]),
}).strict();

export const catalogCategorySchema = z.object({
  code: text(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  nameZh: text(100).min(1),
  nameEn: text(100).default(""),
  descriptionZh: text(500).default(""),
  descriptionEn: text(500).default(""),
  sortOrder: z.coerce.number().int().min(-10_000).max(10_000).default(0),
  isActive: z.boolean().default(true),
}).strict();

export const catalogItemSchema = z.object({
  categoryId: z.string().uuid(),
  subcategoryId: z.string().uuid(),
  sku: text(100).nullable().optional(),
  nameZh: text(200).min(1),
  nameEn: text(200).default(""),
  spec: text(500).default(""),
  specMetadata: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/), attributeValue).refine((value) => Object.keys(value).length <= 40).default({}),
  unit: text(40).min(1).default("件"),
  packSize: quantity.default(1),
  estimatedUnitPrice: money(9_999_999.99).nullable().optional(),
  vendor: nullableText(200),
  url: z.string().url().max(2_000).nullable().optional(),
  keywords: z.array(text(60).min(1)).max(30).default([]),
  imageAssetId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().default(true),
}).strict();
