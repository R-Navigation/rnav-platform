import type { Member } from "./MemberManagement";

/** Mirror the public DTO, never include account email or private phone. */
export function memberPreview(member: Member) {
  const fields = new Set(member.publicFields),
    alumni = member.memberStatus === "alumni";
  const localized = (field: string, zh: string, en: string) =>
    fields.has(field) ? { zh, en } : { zh: "", en: "" };
  const degree = (
    {
      faculty: ["教师", "Faculty"],
      postdoc: ["博士后", "Postdoc"],
      phd: ["博士", "PhD"],
      master: ["硕士", "Master"],
      undergrad: ["本科", "Undergraduate"],
    } as Record<string, string[]>
  )[member.degreeLevel] || ["", ""];
  const graduateDegree =
    member.degreeLevel === "postdoc"
      ? "Postdoctoral"
      : member.degreeLevel === "undergrad"
        ? "Bachelor"
        : degree[1];
  return {
    name: {
      zh: fields.has("name_zh") ? member.nameZh : "",
      en: fields.has("name_en") ? member.nameEn : "",
    },
    degree: !alumni
      ? localized("academic", ...(degree as [string, string]))
      : { zh: "", en: "" },
    enrollmentYear:
      !alumni && fields.has("academic") ? member.enrollmentYear : "",
    graduation: alumni
      ? localized(
          "academic",
          member.graduationYear && degree[0]
            ? `${member.graduationYear}届${degree[0]}`
            : degree[0],
          member.graduationYear && graduateDegree
            ? `${graduateDegree}, Graduated ${member.graduationYear}`
            : graduateDegree,
        )
      : null,
    major: localized("major", member.majorZh, member.majorEn),
    research: localized(
      "research",
      member.researchInterestsZh,
      member.researchInterestsEn,
    ),
    bio: localized("bio", member.bioZh, member.bioEn),
    thesis: alumni
      ? localized("thesis", member.thesisZh, member.thesisEn)
      : null,
    destination: alumni
      ? localized("destination", member.destinationZh, member.destinationEn)
      : null,
    image:
      fields.has("avatar") && member.avatarUrl
        ? {
            src: member.avatarUrl,
            positionX: member.avatarPositionX,
            positionY: member.avatarPositionY,
            zoom: member.avatarZoom,
          }
        : null,
    links: fields.has("links")
      ? member.personalLinks.map((link) => ({
          label: { zh: link.labelZh, en: link.labelEn },
          href: link.url,
        }))
      : [],
    contacts:
      fields.has("email") && member.publicEmail
        ? [
            {
              label: { zh: "邮箱", en: "Email" },
              value: { zh: member.publicEmail, en: member.publicEmail },
            },
          ]
        : [],
  };
}
