import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);
const optionalUrl = z.union([z.literal(""), z.string().url().max(500)]);
export const publicProfileFields = [
  "avatar", "name_zh", "name_en", "title", "bio",
  "research_interests", "email", "homepage", "github"
] as const;

export const profileUpdateSchema = z.object({
  version: z.coerce.number().int().positive(),
  nameZh: text(100),
  nameEn: text(100),
  titleZh: text(160),
  titleEn: text(160),
  email: z.union([z.literal(""), z.string().email().max(320)]),
  phone: text(50),
  bioZh: text(4000),
  bioEn: text(4000),
  researchInterestsZh: text(2000),
  researchInterestsEn: text(2000),
  homepageUrl: optionalUrl,
  githubUrl: optionalUrl,
  avatarAssetId: z.string().uuid().nullable(),
  publicFields: z.array(z.enum(publicProfileFields)).max(publicProfileFields.length)
}).strict().superRefine((value, context) => {
  if (new Set(value.publicFields).size !== value.publicFields.length) {
    context.addIssue({ code: "custom", path: ["publicFields"], message: "Duplicate public field" });
  }
});

export type ProfileUpdate = z.output<typeof profileUpdateSchema>;
