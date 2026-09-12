import { z } from "zod";

const MAX_BIGINT = 9_223_372_036_854_775_807n;
const text = (max = 20_000) => z.string().trim().max(max);
const codeSchema = z.string().trim().min(1).max(191);
const localizedTextSchema = z.object({ zh: text(), en: text() }).strict();
const sortOrderSchema = z.number().int().min(-1_000_000).max(1_000_000);
const forbiddenKeys = new Set(["__proto__", "prototype", "constructor"]);
const postgresBigintSchema = (pattern: RegExp, message: string) => z.string().regex(pattern).refine((value) => {
  try { return BigInt(value) <= MAX_BIGINT; } catch { return false; }
}, message);

export const revisionSchema = postgresBigintSchema(/^\d+$/, "Revision exceeds PostgreSQL bigint range");
export const codeParamSchema = codeSchema;
export const noteIdParamSchema = postgresBigintSchema(/^[1-9]\d*$/, "Note id exceeds PostgreSQL bigint range");
export const requestIdParamSchema = z.string().uuid();

export const platformTypeSchema = z.object({
  code: codeSchema,
  name: text(200).min(1),
}).strict();

export const deviceTypeSchema = z.object({
  code: codeSchema,
  name: text(200).min(1),
}).strict();

export const specSchema=z.object({key:codeSchema,label:localizedTextSchema,value:localizedTextSchema,unit:text(100).default(""),publicVisible:z.boolean().default(false),sortOrder:sortOrderSchema.default(0)}).strict();
export const platformPublicProfileSchema=z.object({publicVisible:z.boolean().default(false),title:localizedTextSchema,description:localizedTextSchema,imageAssetId:z.string().uuid().nullable().default(null),tags:z.array(text(100)).max(50).default([]),componentDisplayMode:z.enum(["none","summary","detail"]).default("summary"),sortOrder:sortOrderSchema.default(0)}).strict();
export const assetPublicProfileSchema=z.object({publicVisible:z.boolean().default(false),title:localizedTextSchema,description:localizedTextSchema,imageAssetId:z.string().uuid().nullable().default(null),sortOrder:sortOrderSchema.default(0)}).strict();

export const platformSchema = z.object({
  code: codeSchema,
  typeCode: codeSchema,
  name: localizedTextSchema,
  description: localizedTextSchema,
  status: z.enum(["active", "maintenance", "building", "lend", "retired"]),
  assetCodes: z.array(codeSchema).max(1_000).default([]).refine((codes) => new Set(codes).size === codes.length, "Duplicate assets are not allowed"),
  location:text(500).nullable().default(null),maintainerUserId:z.string().uuid().nullable().default(null),commissionedAt:z.union([z.literal(""),z.string().date()]).default(""),
  specs:z.array(specSchema).max(200).default([]),publicProfile:platformPublicProfileSchema.default({publicVisible:false,title:{zh:"",en:""},description:{zh:"",en:""},imageAssetId:null,tags:[],componentDisplayMode:"summary",sortOrder:0}),
}).strict();

const assetShape = {
  code: codeSchema,
  deviceTypeCode: codeSchema,
  model: text(500),
  name: localizedTextSchema,
  description: localizedTextSchema,
  vendorSerial: text(500),
  manufacturer:text(500).default(""),condition:z.enum(["normal","maintenance","retired"]).default("normal"),
  status: z.enum(["idle", "in_use", "mounted", "maintenance", "lend", "retired"]),
  currentPlatformCode: codeSchema.nullable(),
  assignedUserId: z.string().uuid().nullable(),
  borrowerName: text(500),
  borrowerContact: text(500),
  storageLocation: text(500).nullable().default(null),
  platformRole:localizedTextSchema.default({zh:"",en:""}),platformSlot:text(191).nullable().default(null),platformSortOrder:sortOrderSchema.default(0),mountedAt:z.string().nullable().default(null),
  specs:z.array(specSchema).max(200).default([]),publicProfile:assetPublicProfileSchema.default({publicVisible:false,title:{zh:"",en:""},description:{zh:"",en:""},imageAssetId:null,sortOrder:0}),
};
const validateAssetState = (value: z.infer<z.ZodObject<typeof assetShape>>, context: z.RefinementCtx) => {
  if (value.status === "mounted" && !value.currentPlatformCode) context.addIssue({ code: "custom", path: ["currentPlatformCode"], message: "已装载设备必须选择平台" });
  if (value.status === "in_use" && !value.assignedUserId) context.addIssue({ code: "custom", path: ["assignedUserId"], message: "使用中设备必须选择使用成员" });
  if (value.status === "lend" && (!value.borrowerName || !value.borrowerContact)) context.addIssue({ code: "custom", path: ["borrowerName"], message: "借出设备必须填写借用者和联系方式" });
};
export const assetSchema = z.object(assetShape).strict().superRefine(validateAssetState);

export const usageRequestSchema = z.object({
  assetCode: codeSchema,
  reason: text(2_000),
  expectedRevision: revisionSchema,
}).strict();

export const usageReviewSchema = z.object({
  action: z.enum(["approve", "reject"]),
  note: text(2_000),
  expectedRevision: revisionSchema,
}).strict();

export const noteSchema = z.object({ content: localizedTextSchema, sortOrder: sortOrderSchema }).strict();
export const pageSchema = z.custom<Record<string, unknown>>(
  (value) => Boolean(value && typeof value === "object" && !Array.isArray(value)),
  "Page content must be a JSON object",
).superRefine((value, context) => {
  let nodes = 0; let stringChars = 0;
  const visit = (current: unknown, depth: number, path: (string | number)[]) => {
    nodes += 1;
    if (nodes > 10_000) context.addIssue({ code: "custom", message: "JSON is too large", path });
    if (depth > 20) context.addIssue({ code: "custom", message: "JSON is too deeply nested", path });
    if (typeof current === "string") { stringChars += current.length; if (current.length > 20_000 || stringChars > 200_000) context.addIssue({ code: "custom", message: "JSON strings are too large", path }); return; }
    if (current === null || typeof current === "boolean" || (typeof current === "number" && Number.isFinite(current))) return;
    if (typeof current !== "object") { context.addIssue({ code: "custom", message: "Value must be JSON-compatible", path }); return; }
    if (Array.isArray(current)) { if (current.length > 500) context.addIssue({ code: "custom", message: "List is too long", path }); current.forEach((item, index) => visit(item, depth + 1, [...path, index])); return; }
    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== null) { context.addIssue({ code: "custom", message: "Object must be plain JSON", path }); return; }
    for (const key of Object.keys(current)) { if (forbiddenKeys.has(key)) context.addIssue({ code: "custom", message: "Prototype keys are forbidden", path: [...path, key] }); visit((current as Record<string, unknown>)[key], depth + 1, [...path, key]); }
  };
  visit(value, 0, []);
});

const withRevision = <T extends z.ZodRawShape>(shape: T) => z.object({ ...shape, expectedRevision: revisionSchema }).strict();
export const platformTypeRequestSchema = withRevision(platformTypeSchema.shape);
export const deviceTypeRequestSchema = withRevision(deviceTypeSchema.shape);
export const platformRequestSchema = withRevision(platformSchema.shape);
export const assetRequestSchema = z.object({ ...assetShape, expectedRevision: revisionSchema }).strict().superRefine(validateAssetState);
export const noteRequestSchema = withRevision(noteSchema.shape);
export const deleteRequestSchema = z.object({ expectedRevision: revisionSchema }).strict();
export const pageRequestSchema = z.object({ page: pageSchema, expectedRevision: revisionSchema }).strict();
const batchBase = { assetCodes: z.array(codeSchema).min(1).max(1_000).refine((codes) => new Set(codes).size === codes.length, "Duplicate assets are not allowed"), expectedRevision: revisionSchema };
export const assetBatchRequestSchema = z.discriminatedUnion("action", [
  z.object({ ...batchBase, action: z.literal("set_status"), value: z.enum(["idle", "maintenance", "retired"]) }).strict(),
  z.object({ ...batchBase, action: z.literal("set_device_type"), value: codeSchema }).strict(),
  z.object({ ...batchBase, action: z.literal("set_location"), value: text(500).nullable() }).strict(),
]);
export const assetImportRowSchema = z.object({
  code: codeSchema,
  nameZh: text(500).refine((value) => value.length > 0, "设备名称不能为空"),
  nameEn: text(500),
  model: text(500),
  deviceTypeCode: codeSchema,
  vendorSerial: text(500),
  storageLocation: text(500),
  status: text(50),
  platformCode: text(191),
  descriptionZh: text(5_000),
  procurementRequestId: z.string().uuid().optional(),
}).strict();
export const assetImportRequestSchema = z.object({ rows: z.array(assetImportRowSchema).min(1).max(1_000), expectedRevision: revisionSchema, createMissingDeviceTypes: z.boolean().optional() }).strict();
export const inventoryCreateSchema = z.object({ name: text(200).min(1), assetCodes: z.array(codeSchema).max(5_000).default([]) }).strict();
export const inventoryScanSchema = z.object({ assetCode: codeSchema }).strict();
export const inventoryBatchIdSchema = z.string().uuid();
export const componentAddSchema=z.object({assetCode:codeSchema,role:localizedTextSchema.default({zh:"",en:""}),slot:text(191).nullable().default(null),sortOrder:sortOrderSchema.default(0),expectedRevision:revisionSchema}).strict();
export const componentUpdateSchema=z.object({role:localizedTextSchema,slot:text(191).nullable(),sortOrder:sortOrderSchema,expectedRevision:revisionSchema}).strict();
export const componentRemoveSchema=z.object({storageLocation:text(500).min(1),expectedRevision:revisionSchema}).strict();
export const componentTransferSchema=componentAddSchema.omit({assetCode:true});
export const platformSlotsRequestSchema=z.object({slots:z.array(z.object({slotKey:codeSchema,name:localizedTextSchema,deviceTypeCode:codeSchema.nullable(),required:z.boolean(),minCount:z.number().int().min(0),maxCount:z.number().int().min(0).nullable(),sortOrder:sortOrderSchema}).strict()).max(200),expectedRevision:revisionSchema}).strict();
export const deviceSpecDefinitionsRequestSchema=z.object({definitions:z.array(z.object({key:codeSchema,label:localizedTextSchema,unit:text(100),sortOrder:sortOrderSchema}).strict()).max(200),expectedRevision:revisionSchema}).strict();

export type LocalizedText = z.infer<typeof localizedTextSchema>;
export type LabPlatformType = z.infer<typeof platformTypeSchema>;
export type LabDeviceType = z.infer<typeof deviceTypeSchema>;
export type LabPlatform = z.input<typeof platformSchema>;
export type LabAsset = z.input<typeof assetSchema>;
export type LabNote = z.infer<typeof noteSchema>;
export type UsageRequestInput = z.infer<typeof usageRequestSchema>;
export type UsageReviewInput = z.infer<typeof usageReviewSchema>;
export type AssetBatchInput = z.infer<typeof assetBatchRequestSchema>;
export type AssetImportRow = z.infer<typeof assetImportRowSchema>;
export type AssetImportInput = z.infer<typeof assetImportRequestSchema>;
