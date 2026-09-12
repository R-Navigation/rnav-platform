import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);
const webUrl = z.string().trim().url().max(500).refine((value) => /^https?:\/\//i.test(value), "Only HTTP(S) links are supported");

export const publicProfileFields = [
  "avatar", "name_zh", "name_en", "academic", "major", "research",
  "bio", "email", "links", "thesis", "destination",
] as const;

export const personalLinkSchema = z.object({
  labelZh: text(80),
  labelEn: text(80),
  url: webUrl,
}).strict().refine((value) => value.labelZh || value.labelEn, {
  message: "Personal link requires a label",
  path: ["labelZh"],
});

const profileUpdateObject = z.object({
  version: z.coerce.number().int().positive(),
  memberStatus: z.enum(["current", "alumni"]),
  degreeLevel: z.enum(["", "faculty", "postdoc", "undergrad", "master", "phd"]),
  nameZh: text(100),
  nameEn: text(100),
  email: z.union([z.literal(""), z.string().email().max(320)]),
  phone: text(50),
  bioZh: text(4000),
  bioEn: text(4000),
  researchInterestsZh: text(2000),
  researchInterestsEn: text(2000),
  enrollmentYear: z.union([z.literal(""), z.string().regex(/^20\d{2}$/)]),
  graduationYear: z.union([z.literal(""), z.string().regex(/^20\d{2}$/)]),
  majorZh: text(200),
  majorEn: text(200),
  thesisZh: text(500),
  thesisEn: text(500),
  destinationZh: text(300),
  destinationEn: text(300),
  avatarAssetId: z.string().uuid().nullable(),
  avatarPositionX: z.coerce.number().int().min(0).max(100),
  avatarPositionY: z.coerce.number().int().min(0).max(100),
  avatarZoom: z.coerce.number().min(1).max(3),
  personalLinks: z.array(personalLinkSchema).max(12),
  publicFields: z.array(z.enum(publicProfileFields)).max(publicProfileFields.length),
}).strict();
function validateProfile(value: z.output<typeof profileUpdateObject>, context: z.RefinementCtx) {
  if (new Set(value.publicFields).size !== value.publicFields.length) {
    context.addIssue({ code: "custom", path: ["publicFields"], message: "Duplicate public field" });
  }
  const urls = value.personalLinks.map((link) => link.url.toLowerCase());
  if (new Set(urls).size !== urls.length) {
    context.addIssue({ code: "custom", path: ["personalLinks"], message: "Duplicate personal link" });
  }
}
export const profileUpdateSchema = profileUpdateObject.superRefine(validateProfile);

export const adminProfileUpdateSchema = profileUpdateObject.extend({
  memberCategory: z.enum(["advisor", "postdoc", "phd", "master", "undergrad", "alumni"]),
  publicVisible: z.boolean(),
}).strict().superRefine(validateProfile);

export type ProfileUpdate = z.output<typeof profileUpdateSchema>;
export type AdminProfileUpdate = z.output<typeof adminProfileUpdateSchema>;
