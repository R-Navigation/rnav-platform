import { z } from "zod";
import { procurementStatuses } from "./workflow.js";

const text = (maximum: number) => z.string().trim().max(maximum);

export const procurementItemSchema = z.object({
  itemName: text(200).min(1),
  spec: text(500).default(""),
  quantity: z.coerce.number().positive().max(1_000_000),
  estimatedUnitPrice: z.coerce.number().nonnegative().max(100_000_000).nullable().optional(),
  vendor: text(200).nullable().optional(),
  url: z.string().url().max(2_000).nullable().optional(),
  remark: text(1_000).nullable().optional(),
}).strict();

export const createProcurementSchema = z.object({
  title: text(200).min(1),
  reason: text(4_000),
  items: z.array(procurementItemSchema).min(1).max(100),
}).strict();

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
