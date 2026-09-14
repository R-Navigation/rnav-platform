export type AcademicStage =
  | "faculty"
  | "postdoc"
  | "phd"
  | "master"
  | "undergrad";

export const academicStageLabels: Record<AcademicStage, string> = {
  faculty: "教师",
  postdoc: "博士后",
  phd: "博士生",
  master: "硕士生",
  undergrad: "本科生",
};

export const publicProfileFieldGroups = [
  {
    label: "身份",
    fields: [
      ["name_zh", "中文姓名"],
      ["name_en", "英文姓名"],
      ["avatar", "头像"],
      ["academic_stage", "学术身份"],
      ["enrollment_year", "入组年份"],
      ["graduation_year", "毕业年份"],
    ],
  },
  {
    label: "学术",
    fields: [
      ["major", "专业"],
      ["research", "研究方向"],
      ["bio", "个人简介"],
      ["thesis", "学位论文"],
      ["destination", "毕业去向"],
    ],
  },
  {
    label: "联系",
    fields: [
      ["email", "公开邮箱"],
      ["phone", "电话"],
      ["links", "个人链接"],
    ],
  },
] as const;

