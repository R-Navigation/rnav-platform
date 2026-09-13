export const homeFallback = {
  hero: {
    eyebrow: { zh: "武汉大学 | LIESMARS", en: "LIESMARS | WUHAN UNIVERSITY" },
    title: {
      zh: "R-Nav：面向复杂环境的韧性导航与",
      en: "R-Nav: Advancing Resilient Navigation &",
    },
    highlight: { zh: "具身智能", en: "Embodied AI" },
    description: {
      zh: "我们研发面向复杂环境的鲁棒导航、感知与具身智能算法。",
      en: "We develop robust navigation, perception, and embodied intelligence for complex environments.",
    },
    actions: [],
    image: null,
  },
  sections: {
    researchAreasTitle: { zh: "核心研究方向", en: "Core Research Areas" },
    researchAreasCta: { zh: "查看研究", en: "Explore Research" },
  },
  researchAreas: [],
  featuredResearchIds: [],
  featuredFacilityIds: [],
  featuredMemberSlugs: [],
  newsPreviewIds: [],
  compositionOrder: ["directions", "work", "people", "status", "contact"],
  sectionOrder: [
    "researchAreas",
    "featuredResearch",
    "facilities",
    "members",
    "news",
    "monitor",
    "contact",
  ],
  sectionVisibility: {
    researchAreas: true,
    featuredResearch: true,
    facilities: true,
    members: true,
    news: true,
    monitor: true,
    contact: true,
  },
};
export const directionsFallback = {
  header: {
    eyebrow: { zh: "研究方向", en: "RESEARCH DIRECTIONS" },
    title: { zh: "研究方向", en: "Research directions" },
    description: {
      zh: "我们研究机器人在复杂环境中的定位、建图、决策与协作。",
      en: "We study robot localization, mapping, decision-making and collaboration in complex environments.",
    },
  },
  hero: { image: null },
  directions: [],
};
export const researchFallback = {
  header: {
    eyebrow: { zh: "研究成果", en: "RESOURCES" },
    title: { zh: "论文发表", en: "Publications" },
    description: {
      zh: "展示团队的代表性科研成果。",
      en: "Selected research contributions from the group.",
    },
  },
  publications: [],
  filters: [],
  topicLabels: [],
  typeLabels: [],
  topicOrder: [],
  typeOrder: [],
  ui: {
    searchPlaceholder: { zh: "搜索论文...", en: "Search publications..." },
    emptyTitle: { zh: "未找到相关论文", en: "No publications found" },
    emptyDescription: {
      zh: "请调整搜索关键词或切换分组方式。",
      en: "Adjust the search query or grouping mode.",
    },
    countSingle: { zh: "篇论文", en: "Publication" },
    countPlural: { zh: "篇论文", en: "Publications" },
    previewFallback: { zh: "暂无预览图", en: "Preview Unavailable" },
  },
  footerGraphicText: {
    zh: "韧性导航与自主视觉研究",
    en: "Resilient Navigation and Autonomous Vision Research",
  },
};
export const teamFallback = {
  header: {
    eyebrow: { zh: "团队成员", en: "Our People" },
    title: { zh: "研究团队", en: "The Research Team" },
    description: {
      zh: "团队汇聚机器人、计算机视觉与具身智能等方向的研究力量。",
      en: "Expertise in robotics, computer vision, and embodied intelligence.",
    },
  },
  sectionTitles: {
    faculty: { zh: "导师", en: "Faculty" },
    postdocs: { zh: "博士后", en: "Postdocs" },
    phd: { zh: "博士生", en: "PhD Students" },
    master: { zh: "硕士生", en: "Master Students" },
    undergrad: { zh: "本科生", en: "Undergraduates" },
    alumni: { zh: "毕业生", en: "Alumni" },
  },
  advisors: [],
  postdocs: [],
  phdStudents: [],
  masterStudents: [],
  undergraduateStudents: [],
  alumni: [],
  recruitment: {
    title: { zh: "欢迎联系我们", en: "Join Our Team" },
    description: {
      zh: "欢迎对机器人与导航研究有兴趣的同学与合作伙伴联系。",
      en: "Students and collaborators are welcome to contact us.",
    },
    buttonLabel: { zh: "联系我们", en: "Contact Us" },
    buttonHref: "/contact",
  },
};
export const facilitiesFallback = {
  header: {
    eyebrow: { zh: "硬件与基础设施", en: "Hardware & Infrastructure" },
    title: { zh: "实验平台", en: "Experimental Platforms" },
    description: {
      zh: "用于复杂环境韧性导航研究的机器人平台与传感设备。",
      en: "Robotic platforms and sensors for resilient navigation research.",
    },
  },
  facilitySections: [],
  cta: {
    title: { zh: "合作研究", en: "Research Collaboration" },
    description: {
      zh: "欢迎联系我们开展合作研究。",
      en: "Contact us about collaborative research.",
    },
    buttonLabel: { zh: "联系我们", en: "Contact Us" },
    buttonHref: "/contact",
  },
};
export const newsFallback = {
  header: {
    eyebrow: { zh: "实验室动态", en: "LABORATORY UPDATES" },
    title: { zh: "最新进展", en: "Latest from the Frontier" },
    description: {
      zh: "跟踪团队最新研究与学术进展。",
      en: "Research and academic updates from the group.",
    },
  },
  items: [],
};
export const contactFallback = {
  header: {
    eyebrow: { zh: "联系与合作", en: "CONTACT & COLLABORATION" },
    title: { zh: "联系 R-Nav 研究组", en: "Contact the R-Nav Research Group" },
    description: {
      zh: "获取合作、招生、数据集与设备相关联系信息。",
      en: "Contact information for collaboration, opportunities, datasets, and facilities.",
    },
  },
  sectionTitles: {
    channels: { zh: "联系方式", en: "CONTACT CHANNELS" },
    social: { zh: "社交账号", en: "Social Accounts" },
  },
  introText: {
    zh: "团队公开联系信息。",
    en: "Public contact channels for the group.",
  },
  primaryChannels: [],
  socialLinks: [],
  extraCards: [],
  heroImage: null,
};
