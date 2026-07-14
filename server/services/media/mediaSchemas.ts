import { z } from "zod";

export const mediaMimeTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const mediaListSchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(["active", "recycled"]).default("active")
}).strict();
export const mediaIdSchema = z.string().uuid();
