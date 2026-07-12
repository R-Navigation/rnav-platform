import { z } from "zod";

export const pageKeys = ["site", "home", "research_page", "news_page", "team_page", "facilities_page", "contact_page"] as const;
export const pageKeySchema = z.enum(pageKeys);
export type PageKey = z.infer<typeof pageKeySchema>;

export type SiteRecord = Record<string, any>;
export type ContactItems = { primaryChannels: SiteRecord[]; socialLinks: SiteRecord[]; extraCards: SiteRecord[] };

const MAX_STRING = 20_000;
const MAX_LIST = 500;
const MAX_DEPTH = 20;
const MAX_NODES = 10_000;
const forbiddenKeys = new Set(["__proto__", "prototype", "constructor"]);

function inspectJson(value: unknown, context: z.RefinementCtx) {
  let nodes = 0;
  const visit = (current: unknown, depth: number, path: (string | number)[]) => {
    nodes += 1;
    if (nodes > MAX_NODES) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "JSON is too large", path });
      return;
    }
    if (depth > MAX_DEPTH) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "JSON is too deeply nested", path });
      return;
    }
    if (typeof current === "string") {
      if (current.length > MAX_STRING) context.addIssue({ code: z.ZodIssueCode.too_big, maximum: MAX_STRING, inclusive: true, type: "string", message: "String is too long", path });
      return;
    }
    if (current === null || typeof current === "boolean" || typeof current === "number") return;
    if (typeof current !== "object") {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Value must be JSON-compatible", path });
      return;
    }
    if (Array.isArray(current)) {
      if (current.length > MAX_LIST) context.addIssue({ code: z.ZodIssueCode.too_big, maximum: MAX_LIST, inclusive: true, type: "array", message: "List is too long", path });
      current.forEach((item, index) => visit(item, depth + 1, [...path, index]));
      return;
    }
    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== null) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Object must be plain JSON", path });
      return;
    }
    for (const key of Object.keys(current)) {
      if (forbiddenKeys.has(key)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Prototype keys are forbidden", path: [...path, key] });
      visit((current as Record<string, unknown>)[key], depth + 1, [...path, key]);
    }
  };
  visit(value, 0, []);
}

const safeJson = z.unknown().superRefine(inspectJson);
const revision = z.string().regex(/^\d+$/).max(30);
const identifier = z.string().trim().min(1).max(200);

export const pageRequestSchema = z.object({ content: safeJson, expectedUpdatedAt: revision }).strict();

function collectionSchema(validate: (item: SiteRecord, context: z.RefinementCtx, index: number) => void) {
  return z.object({ items: z.array(safeJson).max(MAX_LIST).superRefine((items, context) => {
    items.forEach((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Item must be an object", path: [index] });
      } else validate(item as SiteRecord, context, index);
    });
  }).transform((items) => items as SiteRecord[]), expectedUpdatedAt: revision }).strict();
}

function requireStringField(item: SiteRecord, field: string, context: z.RefinementCtx, index: number) {
  if (!identifier.safeParse(item[field]).success) context.addIssue({ code: z.ZodIssueCode.custom, message: `${field} is required`, path: [index, field] });
}

const contactGroup = z.array(safeJson).max(MAX_LIST).transform((items) => items as SiteRecord[]);

export const collectionRequestSchemas = {
  research: collectionSchema((item, context, index) => requireStringField(item, "id", context, index)),
  news: collectionSchema((item, context, index) => requireStringField(item, "id", context, index)),
  team: collectionSchema((item, context, index) => {
    requireStringField(item, "slug", context, index);
    requireStringField(item, "group", context, index);
  }),
  facility: collectionSchema((item, context, index) => requireStringField(item, "category", context, index)),
  contact: z.object({
    items: z.object({ primaryChannels: contactGroup, socialLinks: contactGroup, extraCards: contactGroup }).strict(),
    expectedUpdatedAt: revision
  }).strict()
};
