import { z } from "zod";
export { adminProfileUpdateSchema } from "../account/profileSchemas.js";

export const memberCategories = ["advisor", "postdoc", "phd", "master", "undergrad", "alumni"] as const;
export const createUserSchema = z.object({
  username: z.string().trim().min(3).max(64).regex(/^[a-z0-9][a-z0-9._-]*$/),
  nameZh: z.string().trim().min(1).max(100),
  nameEn: z.string().trim().max(100),
  memberCategory: z.enum(memberCategories).default("undergrad"),
  email: z.string().email().max(320),
  baseTier: z.enum(["normal", "super"]).default("normal"),
  accountKind: z.enum(["person", "system"]).default("person")
}).strict();
export const userListSchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(["active", "disabled", "invited"]).optional(),
  tier: z.enum(["normal", "plus", "super"]).optional(),
  publicVisibility: z.enum(["public", "private"]).optional(),
  profile: z.enum(["complete", "incomplete", "stale"]).optional(),
  login: z.enum(["never", "active", "stale"]).optional(),
  memberStatus: z.enum(["current", "alumni"]).optional()
}).strict();
export const statusSchema = z.object({ status: z.enum(["active", "disabled"]) }).strict();
export const tierSchema = z.object({ baseTier: z.enum(["normal", "super"]) }).strict();
export const accountKindSchema = z.object({ accountKind: z.enum(["person", "system"]) }).strict();
export const publicProfileAdminSchema = z.object({
  publicVisible: z.boolean(),
}).strict();
export const userIdSchema = z.string().uuid();
export const accountEmailSchema = z.object({ email: z.string().email().max(320) }).strict();
export const convertAlumniSchema = z.object({ confirm: z.literal(true) }).strict();
export const importUserRowSchema = createUserSchema.omit({ baseTier: true }).extend({
  baseTier: z.enum(["normal", "super"]).default("normal"),
  publicEmail: z.union([z.literal(""), z.string().email().max(320)]).default(""),
});
export const importUsersSchema = z.object({ rows: z.array(importUserRowSchema).min(1).max(500) }).strict();
