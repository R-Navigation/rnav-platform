import { z } from "zod";

const MAX_BIGINT = 9_223_372_036_854_775_807n;
const textSchema = z.string().max(20_000);
const codeSchema = z.string().trim().min(1).max(191);
const localizedTextSchema = z.object({ zh: textSchema, en: textSchema }).strict();
const sortOrderSchema = z.number().int().min(-1_000_000).max(1_000_000);
const postgresBigintSchema = (pattern: RegExp, message: string) =>
  z.string().regex(pattern).refine((value) => {
    try {
      return BigInt(value) <= MAX_BIGINT;
    } catch {
      return false;
    }
  }, message);

export const revisionSchema = postgresBigintSchema(/^\d+$/, "Revision exceeds PostgreSQL bigint range");
export const codeParamSchema = codeSchema;
export const noteIdParamSchema = postgresBigintSchema(/^[1-9]\d*$/, "Note id exceeds PostgreSQL bigint range");

export const platformTypeSchema = z.object({
  code: codeSchema,
  sortOrder: sortOrderSchema,
  name: localizedTextSchema,
  description: localizedTextSchema,
}).strict();

export const platformSchema = z.object({
  code: codeSchema,
  typeCode: codeSchema.nullable(),
  sortOrder: sortOrderSchema,
  name: localizedTextSchema,
  description: localizedTextSchema,
  status: z.enum(["active", "partial", "empty", "maintenance", "lend"]),
}).strict();

export const assetSchema = z.object({
  code: codeSchema,
  deviceType: localizedTextSchema,
  model: textSchema,
  name: localizedTextSchema,
  description: localizedTextSchema,
  vendorSerial: textSchema,
  status: z.enum(["idle", "mounted", "maintenance", "retired", "lend"]),
  currentPlatformCode: codeSchema.nullable(),
  shareScope: z.string().trim().min(1).max(32),
  sortOrder: sortOrderSchema,
}).strict();

export const noteSchema = z.object({ content: localizedTextSchema, sortOrder: sortOrderSchema }).strict();
export const pageSchema = z.unknown();

const withRevision = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ ...shape, expectedRevision: revisionSchema }).strict();

export const platformTypeRequestSchema = withRevision(platformTypeSchema.shape);
export const platformRequestSchema = withRevision(platformSchema.shape);
export const assetRequestSchema = withRevision(assetSchema.shape);
export const noteRequestSchema = withRevision(noteSchema.shape);
export const deleteRequestSchema = z.object({ expectedRevision: revisionSchema }).strict();
export const pageRequestSchema = z.object({ page: pageSchema, expectedRevision: revisionSchema }).strict();

export type LocalizedText = z.infer<typeof localizedTextSchema>;
export type LabPlatformType = z.infer<typeof platformTypeSchema>;
export type LabPlatform = z.infer<typeof platformSchema>;
export type LabAsset = z.infer<typeof assetSchema>;
export type LabNote = z.infer<typeof noteSchema>;
