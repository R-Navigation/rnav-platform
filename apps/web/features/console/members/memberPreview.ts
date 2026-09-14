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
  )[member.academicStage] || ["", ""];
  const graduateDegree =
    member.academicStage === "postdoc"
      ? "Postdoctoral"
      : member.academicStage === "undergrad"
        ? "Bachelor"
        : degree[1];
  const academicVisible = fields.has("academic_stage");
  const enrollmentVisible = fields.has("enrollment_year");
  const graduationVisible = fields.has("graduation_year");
  const postdoc = member.academicStage === "postdoc";
  return {
    name: {
      zh: fields.has("name_zh") ? member.nameZh : "",
      en: fields.has("name_en") ? member.nameEn : "",
    },
    role: !alumni && academicVisible && postdoc
      ? { zh: "博士后", en: "Postdoctoral Researcher" }
      : { zh: "", en: "" },
    degree: !alumni && academicVisible
      ? enrollmentVisible && member.enrollmentYear
        ? {
            zh: `${member.enrollmentYear}级${postdoc ? "博士" : degree[0]}`,
            en: `${postdoc ? "PhD" : degree[1]}, Class of ${member.enrollmentYear}`,
          }
        : postdoc ? { zh: "", en: "" } : { zh: degree[0], en: degree[1] }
      : { zh: "", en: "" },
    enrollmentYear: !alumni && !academicVisible && enrollmentVisible
      ? { zh: `${member.enrollmentYear}级`, en: `Class of ${member.enrollmentYear}` }
      : { zh: "", en: "" },
    graduation: alumni
      ? {
          zh: `${graduationVisible && member.graduationYear ? `${member.graduationYear}届` : ""}${academicVisible ? degree[0] : ""}`,
          en: [academicVisible ? graduateDegree : "", graduationVisible && member.graduationYear ? `Graduated ${member.graduationYear}` : ""].filter(Boolean).join(", "),
        }
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
    contacts: [
      ...(fields.has("email") && member.publicEmail
        ? [
            {
              label: { zh: "邮箱", en: "Email" },
              value: { zh: member.publicEmail, en: member.publicEmail },
            },
          ]
        : []),
      ...(fields.has("phone") && member.phone
        ? [{ label: { zh: "电话", en: "Phone" }, value: { zh: member.phone, en: member.phone } }]
        : []),
    ],
  };
}
