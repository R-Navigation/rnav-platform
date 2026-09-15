import { z } from "zod";
import { managedFieldKeys } from "./types.js";

export const userIdSchema = z.string().uuid();
export const workIdSchema = z.string().uuid();
export const researchItemIdSchema = z.string().trim().min(1).max(200);
export const openAlexAuthorIdSchema = z.string().trim().transform((value) => value.replace(/^https?:\/\/openalex\.org\//i, "").toUpperCase()).pipe(z.string().regex(/^A\d+$/));

export const scholarlyProfilePatchSchema = z.object({
  orcidId: z.string().trim().max(32).nullable().optional(),
  syncEnabled: z.boolean().optional(),
  syncFromYear: z.number().int().min(1900).max(2200).nullable().optional(),
  syncToYear: z.number().int().min(1900).max(2200).nullable().optional(),
  newWorkPolicy: z.enum(["review", "auto"]).optional(),
}).strict().superRefine((value, context) => {
  if (value.syncFromYear != null && value.syncToYear != null && value.syncToYear < value.syncFromYear) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "结束年份不能早于起始年份", path: ["syncToYear"] });
  }
});

export const selfScholarlyProfilePatchSchema = z.object({
  orcidId: z.string().trim().max(32).nullable().optional(),
  syncEnabled: z.boolean().optional(),
  syncFromYear: z.number().int().min(1900).max(2200).nullable().optional(),
  syncToYear: z.number().int().min(1900).max(2200).nullable().optional(),
}).strict().superRefine((value, context) => {
  if (value.syncFromYear != null && value.syncToYear != null && value.syncToYear < value.syncFromYear) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "结束年份不能早于起始年份", path: ["syncToYear"] });
  }
});

export const resolveAuthorSchema = z.object({
  orcidId: z.string().trim().max(32).nullable().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  institution: z.string().trim().max(200).optional(),
}).strict();

export const verifyAuthorSchema = z.object({ openalexAuthorId: openAlexAuthorIdSchema }).strict();
export const mergeWorkSchema = z.object({ researchItemId: researchItemIdSchema }).strict();
const bulkWorkIdsSchema = z.array(workIdSchema).min(1).max(500).superRefine((ids, context) => {
  if (new Set(ids).size !== ids.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "候选论文 ID 不能重复" });
});
export const bulkPlanSchema = z.object({ workIds: bulkWorkIdsSchema }).strict();
export const bulkAcceptSchema = z.object({ workIds: bulkWorkIdsSchema }).strict();
export const bulkIgnoreSchema = z.object({ workIds: bulkWorkIdsSchema }).strict();
export const bulkMergeSchema = z.object({ items: z.array(z.object({ workId: workIdSchema, researchItemId: researchItemIdSchema }).strict()).min(1).max(500) }).strict().superRefine((value, context) => {
  if (new Set(value.items.map((item) => item.workId)).size !== value.items.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "同一候选论文不能重复合并", path: ["items"] });
});
export const managedFieldsSchema = z.object({ managedFields: z.array(z.enum(managedFieldKeys)).max(managedFieldKeys.length) }).strict();
export const resolveResearchItemSchema = z.object({ openalexWorkId: z.string().trim().regex(/^(?:https?:\/\/openalex\.org\/)?W\d+$/i).optional() }).strict();

const openAlexInstitution = z.object({ display_name: z.string().optional() }).passthrough();
export const openAlexAuthorSchema = z.object({
  id: z.string(), display_name: z.string().default(""), orcid: z.string().nullable().optional(),
  works_count: z.number().int().nonnegative().default(0),
  last_known_institutions: z.array(openAlexInstitution).optional(),
  affiliations: z.array(z.object({ institution: openAlexInstitution.optional() }).passthrough()).optional(),
}).passthrough();

export const openAlexWorkSchema = z.object({
  id: z.string(), doi: z.string().nullable().optional(), title: z.string().default(""),
  publication_year: z.number().int().nullable().optional(), publication_date: z.string().nullable().optional(),
  type: z.string().default(""), updated_date: z.string().nullable().optional(), cited_by_count: z.number().nullable().optional(),
  primary_location: z.object({
    landing_page_url: z.string().nullable().optional(),
    source: z.object({ display_name: z.string().optional() }).nullable().optional(),
  }).nullable().optional(),
  ids: z.record(z.string(), z.unknown()).optional(),
  authorships: z.array(z.object({
    author_position: z.string().optional(),
    author: z.object({ id: z.string().nullable().optional(), display_name: z.string().default(""), orcid: z.string().nullable().optional() }).passthrough(),
    raw_author_name: z.string().nullable().optional(),
  }).passthrough()).default([]),
}).passthrough();

export const crossrefWorkSchema = z.object({
  DOI: z.string().optional(), title: z.array(z.string()).optional(),
  "container-title": z.array(z.string()).optional(), type: z.string().optional(), URL: z.string().optional(),
  author: z.array(z.object({ given: z.string().optional(), family: z.string().optional(), ORCID: z.string().optional() }).passthrough()).optional(),
  published: z.object({ "date-parts": z.array(z.array(z.number())) }).optional(),
  "published-print": z.object({ "date-parts": z.array(z.array(z.number())) }).optional(),
  "published-online": z.object({ "date-parts": z.array(z.array(z.number())) }).optional(),
}).passthrough();

export const providerRateLimitSchema = z.object({
  limit: z.number().nullable(), remaining: z.number().nullable(), creditsUsed: z.number().nullable(),
  resetSeconds: z.number().nullable(), resetAt: z.string().datetime().nullable(),
});
export const providerStatusSchema = z.object({
  configured: z.boolean(), health: z.enum(["healthy", "key_missing", "auth_error", "budget_exhausted", "rate_limited", "timeout", "provider_error", "unknown"]),
  checkedAt: z.string().datetime().nullable(), lastSuccessAt: z.string().datetime().nullable(), httpStatus: z.number().nullable(),
  rateLimit: providerRateLimitSchema, message: z.string(),
});
