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
const MAX_TOTAL_STRING_CHARS = 200_000;
const MAX_CHILD_ITEMS = 5_000;
const forbiddenKeys = new Set(["__proto__", "prototype", "constructor"]);

function inspectJson(value: unknown, context: z.RefinementCtx) {
  let nodes = 0;
  let stringChars = 0;
  let childItems = 0;
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
      stringChars += current.length;
      if (stringChars > MAX_TOTAL_STRING_CHARS) context.addIssue({ code: z.ZodIssueCode.custom, message: "JSON strings are too large", path });
      if (current.length > MAX_STRING) context.addIssue({ code: z.ZodIssueCode.too_big, maximum: MAX_STRING, inclusive: true, type: "string", message: "String is too long", path });
      return;
    }
    if (current === null || typeof current === "boolean" || typeof current === "number") return;
    if (typeof current !== "object") {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Value must be JSON-compatible", path });
      return;
    }
    if (Array.isArray(current)) {
      childItems += current.length;
      if (childItems > MAX_CHILD_ITEMS) context.addIssue({ code: z.ZodIssueCode.custom, message: "JSON has too many child items", path });
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
const revision = z.string().regex(/^\d+$/).refine(
  (value) => /^\d+$/.test(value) && BigInt(value) <= 9_223_372_036_854_775_807n,
  "Revision exceeds PostgreSQL bigint range"
);
const positiveBigint = z.string().regex(/^[1-9]\d*$/).refine(
  (value) => /^[1-9]\d*$/.test(value) && BigInt(value) <= 9_223_372_036_854_775_807n,
  "Value exceeds PostgreSQL bigint range"
);
const text = z.string().max(MAX_STRING);
const identifier = z.string().trim().min(1).max(200);
const optionalText = text.optional();
const localized = z.object({ zh: optionalText, en: optionalText }).strict();
const nullableUuid = z.preprocess((value) => value === "" ? null : value, z.string().uuid().nullable()).optional();
const image = z.object({ assetId: nullableUuid, src: optionalText, alt: optionalText, dataAlt: optionalText }).strict().nullable().optional();
const link = z.object({ label: localized.optional(), href: optionalText, icon: optionalText, variant: optionalText }).strict();
const links = z.array(link).max(MAX_LIST).optional();
const sortOrder = z.number().int().min(-1_000_000).max(1_000_000).optional();

export const pageRequestSchema = z.object({ content: safeJson, expectedUpdatedAt: revision }).strict();

function uniqueField<T extends z.ZodRawShape>(item: z.ZodObject<T>, field: string, required = true) {
  return z.object({ items: z.array(item).max(MAX_LIST), expectedUpdatedAt: revision }).strict().superRefine((body, context) => {
    inspectJson(body.items, context);
    const seen = new Set<string>();
    body.items.forEach((entry, index) => {
      const value = (entry as SiteRecord)[field];
      if (!required && value === undefined) return;
      if (seen.has(value)) context.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate ${field}: ${value}`, path: ["items", index, field] });
      else seen.add(value);
    });
  }).transform((body) => ({ ...body, items: body.items as SiteRecord[] }));
}

const researchItem = z.object({
  id: identifier, sortOrder, title: localized.optional(), year: z.union([z.number().int().min(0).max(9999), z.literal("")]).optional(),
  venue: localized.optional(), type: optionalText, topic: optionalText, image,
  pdf: z.object({ assetId: nullableUuid, src: optionalText, label: localized.optional() }).strict().nullable().optional(),
  keywords: z.array(localized).max(MAX_LIST).optional(),
  authors: z.array(z.object({ name: localized.optional(), highlight: z.boolean().optional() }).strict()).max(MAX_LIST).optional(),
  links
}).strict();

const newsItem = z.object({
  id: identifier, sortOrder, date: localized.optional(), badge: localized.optional(), badgeTone: optionalText,
  title: localized.optional(), description: localized.optional(), excerpt: localized.optional(), featured: z.boolean().optional(),
  image, link: link.nullable().optional()
}).strict();

const teamGroups = ["advisor", "postdoc", "phd", "master", "undergrad", "alumni"] as const;
const teamItem = z.object({
  slug: identifier, group: z.enum(teamGroups), sortOrder,
  name: localized.optional(), subtitle: localized.optional(), bio: localized.optional(), role: localized.optional(),
  focus: localized.optional(), degree: localized.optional(), enrollmentYear: optionalText, major: localized.optional(),
  research: localized.optional(), graduation: localized.optional(), thesis: localized.optional(), destination: localized.optional(),
  image, links,
  contacts: z.array(z.object({ label: localized.optional(), value: z.union([text, localized]).optional() }).strict()).max(MAX_LIST).optional()
}).strict();

const facilityItem = z.object({
  id: positiveBigint.optional(), category: identifier, sortOrder, icon: optionalText, tag: localized.optional(), title: localized.optional(),
  description: localized.optional(), specLine: localized.optional(), image,
  specs: z.array(z.object({ label: localized.optional(), value: localized.optional() }).strict()).max(MAX_LIST).optional()
}).strict();

const primaryChannel = z.object({ icon: optionalText, title: localized.optional(), value: localized.optional(), href: optionalText }).strict();
const socialLink = z.object({ icon: optionalText, label: localized.optional(), handle: localized.optional(), href: optionalText }).strict();
const extraCard = z.object({ title: localized.optional(), description: localized.optional(), value: localized.optional() }).strict();

export const collectionRequestSchemas = {
  research: uniqueField(researchItem, "id"),
  news: uniqueField(newsItem, "id"),
  team: uniqueField(teamItem, "slug"),
  facility: uniqueField(facilityItem, "id", false),
  contact: z.object({
    items: z.object({
      primaryChannels: z.array(primaryChannel).max(MAX_LIST),
      socialLinks: z.array(socialLink).max(MAX_LIST),
      extraCards: z.array(extraCard).max(MAX_LIST)
    }).strict(),
    expectedUpdatedAt: revision
  }).strict().superRefine((body, context) => inspectJson(body.items, context))
};
