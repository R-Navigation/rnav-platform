import { z } from "zod";
import { procurementStatuses } from "./workflow.js";

const text = (maximum: number) => z.string().trim().max(maximum);
const money = (maximum: number) => z.coerce.number().nonnegative().max(maximum).refine((value) => Number.isInteger(value * 100), "Use at most two decimal places");
const quantity = z.coerce.number().positive().max(1_000_000).refine((value) => Number.isInteger(value * 100), "Use at most two decimal places");

export const procurementItemSchema = z.object({
  itemName: text(200).min(1),
  spec: text(500).default(""),
  quantity,
  estimatedUnitPrice: money(9_999_999.99).nullable().optional(),
  vendor: text(200).nullable().optional(),
  url: z.string().url().max(2_000).nullable().optional(),
  remark: text(1_000).nullable().optional(),
}).strict();

export const createProcurementSchema = z.object({
  title: text(200).min(1),
  reason: text(4_000),
  items: z.array(procurementItemSchema).min(1).max(100),
}).strict().refine((value) => value.items.reduce((sum, item) => sum + item.quantity * (item.estimatedUnitPrice ?? 0), 0) <= 9_999_999_999.99, { message: "Total estimated amount exceeds database range", path: ["items"] });

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
