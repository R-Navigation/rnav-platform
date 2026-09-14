import { z } from "zod";
import { academicStages } from "../account/profileSchemas.js";
export { adminProfileUpdateSchema } from "../account/profileSchemas.js";

export const createUserSchema = z.object({
  username: z.string().trim().min(3).max(64).regex(/^[a-z0-9][a-z0-9._-]*$/),
  nameZh: z.string().trim().max(100),
  nameEn: z.string().trim().max(100),
  academicStage: z.union([z.literal(""), z.enum(academicStages)]).default(""),
  email: z.union([z.literal(""), z.string().trim().email().max(320)]).default(""),
  baseTier: z.enum(["normal", "super"]).default("normal"),
  accountKind: z.enum(["person", "system"]).default("person")
}).strict().superRefine((value, context) => {
  if (!value.nameZh) {
    context.addIssue({ code: "custom", path: ["nameZh"], message: value.accountKind === "system" ? "显示名称为必填项" : "中文姓名为必填项" });
  }
  if (value.accountKind === "person" && !value.academicStage) {
    context.addIssue({ code: "custom", path: ["academicStage"], message: "学术身份为必填项" });
  }
});
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
export const accountEmailSchema = z.object({ email: z.union([z.literal(""), z.string().trim().email().max(320)]) }).strict();
export const convertAlumniSchema = z.object({ confirm: z.literal(true) }).strict();
export const importUserRowSchema = createUserSchema.innerType().omit({ baseTier: true, accountKind: true }).extend({
  baseTier: z.enum(["normal", "super"]).default("normal"),
  publicEmail: z.union([z.literal(""), z.string().email().max(320)]).default(""),
}).superRefine((value, context) => {
  if (!value.nameZh) context.addIssue({ code: "custom", path: ["nameZh"], message: "中文姓名为必填项" });
  if (!value.academicStage) context.addIssue({ code: "custom", path: ["academicStage"], message: "学术身份为必填项" });
});
export const importUsersSchema = z.object({ rows: z.array(importUserRowSchema).min(1).max(500) }).strict();
