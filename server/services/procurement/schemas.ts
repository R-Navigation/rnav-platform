import { z } from "zod";
import { procurementStatuses } from "./workflow.js";

const text = (maximum: number) => z.string().trim().max(maximum);
const money = (maximum: number) => z.coerce.number().nonnegative().max(maximum).refine((value) => Number.isInteger(value * 100), "Use at most two decimal places");
const quantity = z.coerce.number().positive().max(1_000_000).refine((value) => Number.isInteger(value * 100), "Use at most two decimal places");
const booleanQuery = z.preprocess((value) => value === true || value === "true", z.boolean());
const nullableText = (maximum: number) => text(maximum).nullable().optional();

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

export const commentSchema = z.object({ body: text(2_000).min(1) }).strict();
export const procurementIdSchema = z.string().uuid();

export const catalogQuerySchema = z.object({
  search: text(100).optional().default(""),
  categoryId: z.string().uuid().optional(),
  includeInactive: booleanQuery.optional().default(false),
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
  sku: text(100).nullable().optional(),
  nameZh: text(200).min(1),
  nameEn: text(200).default(""),
  spec: text(500).default(""),
  specMetadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  unit: text(40).min(1).default("件"),
  packSize: quantity.default(1),
  estimatedUnitPrice: money(9_999_999.99).nullable().optional(),
  vendor: nullableText(200),
  url: z.string().url().max(2_000).nullable().optional(),
  keywords: z.array(text(60).min(1)).max(30).default([]),
  imageAssetId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().default(true),
}).strict();
