import { z } from "zod";

export const memberCategories = ["advisor", "postdoc", "phd", "master", "undergrad", "alumni"] as const;
export const createUserSchema = z.object({
  username: z.string().trim().min(3).max(64).regex(/^[a-z0-9][a-z0-9._-]*$/),
  nameZh: z.string().trim().min(1).max(100),
  nameEn: z.string().trim().max(100),
  memberCategory: z.enum(memberCategories),
  email: z.string().email().max(320),
  baseTier: z.enum(["normal", "super"]).default("normal")
}).strict();
export const userListSchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(["active", "disabled", "invited"]).optional(),
  tier: z.enum(["normal", "plus", "super"]).optional()
}).strict();
export const statusSchema = z.object({ status: z.enum(["active", "disabled"]) }).strict();
export const tierSchema = z.object({ baseTier: z.enum(["normal", "super"]) }).strict();
export const publicProfileAdminSchema = z.object({
  publicVisible: z.boolean(),
}).strict();
export const userIdSchema = z.string().uuid();
