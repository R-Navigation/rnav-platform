export type LocaleText = { zh: string; en: string };
export type PublicRecord = Record<string, any>;

export interface PublicSiteRepository {
  getPageContent(key: string): Promise<unknown | null>;
  getResearchItems(): Promise<PublicRecord[]>;
  getNewsItems(): Promise<PublicRecord[]>;
  getTeamMembers(): Promise<PublicRecord[]>;
  getFacilityItems(): Promise<PublicRecord[]>;
  getContactItems(): Promise<{
    primaryChannels: PublicRecord[];
    socialLinks: PublicRecord[];
    extraCards: PublicRecord[];
  }>;
}

const text = (value: unknown, fallback: Partial<LocaleText> = {}): LocaleText => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const candidate = value as Partial<LocaleText>;
    return {
      zh: String(candidate.zh || fallback.zh || "").trim(),
      en: String(candidate.en || fallback.en || "").trim()
    };
  }
  const single = value == null ? "" : String(value).trim();
  return { zh: String(fallback.zh || "").trim(), en: single || String(fallback.en || "").trim() };
};
const object = (value: unknown): PublicRecord => value && typeof value === "object" && !Array.isArray(value) ? value as PublicRecord : {};
const array = (value: unknown): PublicRecord[] => Array.isArray(value) ? value.map(object) : [];
const clean = (value: unknown) => String(value ?? "").trim();

export const publicNavigation = [
  { key: "home", label: { zh: "首页", en: "Home" }, href: "/" },
  { key: "research", label: { zh: "研究", en: "Research" }, href: "/research" },
  { key: "team", label: { zh: "成员", en: "Team" }, href: "/team" },
  { key: "facilities", label: { zh: "实验平台", en: "Facilities" }, href: "/facilities" },
  { key: "news", label: { zh: "新闻", en: "News" }, href: "/news" },
  { key: "monitor", label: { zh: "监控", en: "Monitor" }, href: "/monitor" },
  { key: "contact", label: { zh: "联系", en: "Contact" }, href: "/contact" }
];

export const defaults = {
  site: {
    brandName: { zh: "R-Nav 研究组", en: "R-Nav Research Group" },
    footerDescription: { zh: "推进导航与具身智能研究。", en: "Advancing the frontiers of navigation and AI." },
    footerCopyright: { zh: "© 2024 R-Nav 研究组 | 武汉大学 LIESMARS", en: "© 2024 R-Nav Research Group | LIESMARS, Wuhan University" },
    footerLinks: []
  },
  home: {
    hero: {
      eyebrow: { zh: "武汉大学 | LIESMARS", en: "LIESMARS | WUHAN UNIVERSITY" },
      title: { zh: "R-Nav：面向复杂环境的韧性导航与", en: "R-Nav: Advancing Resilient Navigation &" },
      highlight: { zh: "具身智能", en: "Embodied AI" },
      description: { zh: "我们面向自主系统感知、建图与交互中的真实挑战，研发鲁棒、可扩展的算法与系统。", en: "We develop robust, scalable algorithms for autonomous systems to perceive, map, and interact with complex environments." },
      actions: [], image: null, status: { zh: "", en: "" }
    },
    sections: {
      researchAreasTitle: { zh: "核心研究方向", en: "Core Research Areas" }, researchAreasCta: { zh: "查看项目", en: "View Projects" },
      featuredEyebrow: { zh: "近期成果", en: "RECENT WORK" }, featuredTitle: { zh: "代表论文", en: "Featured Publication" },
      archiveLabel: { zh: "全部论文", en: "Archive" }, newsEyebrow: { zh: "最新动态", en: "UPDATE STREAM" }, newsTitle: { zh: "近期新闻", en: "Latest News" }
    },
    researchAreas: [], featuredPublicationId: "", featuredPublication: { badge: { zh: "", en: "" }, authors: { zh: "", en: "" }, links: [], archiveHref: "/research" }, newsPreviewIds: []
  },
  research: { header: { eyebrow: { zh: "研究成果", en: "RESOURCES" }, title: { zh: "论文发表", en: "Publications" }, description: { zh: "展示团队在 SLAM、机器人感知与多智能体协同方面的代表性科研成果。", en: "Our scientific contributions to SLAM, robot perception, and multi-agent coordination." } }, ui: { emptyTitle: { zh: "暂无论文", en: "No publications" } }, filters: [], topicLabels: [], typeLabels: [], topicOrder: [], typeOrder: [] },
  news: { header: { eyebrow: { zh: "实验室动态", en: "LABORATORY UPDATES" }, title: { zh: "最新进展", en: "Latest from the Frontier" }, description: { zh: "跟踪团队在具身智能与韧性导航方向的研究突破、学术进展与合作成果。", en: "Stay informed about our latest research breakthroughs, academic milestones, and collaborations." } } },
  team: { header: { eyebrow: { zh: "团队成员", en: "Our People" }, title: { zh: "研究团队", en: "The Research Team" }, description: { zh: "团队汇聚机器人、计算机视觉与具身智能等方向的研究力量。", en: "Combining expertise in robotics, computer vision, and embodied intelligence." } }, sectionTitles: { faculty: { zh: "导师", en: "Faculty" }, postdocs: { zh: "博士后", en: "Postdoctoral Researchers" }, phd: { zh: "博士生", en: "PhD Students" }, master: { zh: "硕士生", en: "Master Students" }, undergrad: { zh: "本科生", en: "Undergraduate Students" }, alumni: { zh: "毕业生", en: "Graduates" } }, recruitment: { title: { zh: "欢迎联系我们", en: "Join Our Team" }, description: { zh: "我们持续欢迎对机器人与导航研究有兴趣的同学与合作伙伴联系。", en: "We welcome students and collaborators passionate about robotics and navigation." }, buttonLabel: { zh: "联系我们", en: "Contact Us" }, buttonHref: "/contact" } },
  facilities: { header: { eyebrow: { zh: "硬件与基础设施", en: "Hardware & Infrastructure" }, title: { zh: "实验平台", en: "Experimental Platforms" }, description: { zh: "团队维护多类机器人平台与高精度传感设备，用于复杂环境下的韧性导航研究。", en: "The group maintains robotic platforms and high-precision sensors for resilient navigation research." } }, facilitySections: [], cta: { title: { zh: "合作研究", en: "Research Collaboration" }, description: { zh: "如需使用团队硬件开展合作研究或数据采集，可联系我们。", en: "Contact us about collaborative research or dataset collection." }, buttonLabel: { zh: "联系我们", en: "Contact Us" }, buttonHref: "/contact" } },
  contact: { header: { eyebrow: { zh: "联系与合作", en: "CONTACT & COLLABORATION" }, title: { zh: "联系 R-Nav 研究组", en: "Contact the R-Nav Research Group" }, description: { zh: "可通过本页获取团队合作、招生、数据集与设备等联系信息。", en: "Reach our lab for collaboration, student opportunities, datasets, and facilities access." } }, sectionTitles: { channels: { zh: "联系方式", en: "CONTACT CHANNELS" }, social: { zh: "社交账号", en: "Social Accounts" } }, introText: { zh: "本页展示团队公开联系信息。", en: "The team can be reached through the channels below." }, heroImage: null, primaryChannels: [], socialLinks: [], extraCards: [] }
};

function mergeLocalized(base: PublicRecord, stored: unknown): PublicRecord {
  const source = object(stored);
  const result: PublicRecord = { ...base, ...source };
  for (const [key, fallback] of Object.entries(base)) {
    const value = source[key];
    if (fallback && typeof fallback === "object" && !Array.isArray(fallback) && ("zh" in fallback || "en" in fallback)) result[key] = text(value, fallback as LocaleText);
    else if (fallback && typeof fallback === "object" && !Array.isArray(fallback)) result[key] = mergeLocalized(fallback, value);
  }
  return result;
}

function normalizeItem(item: PublicRecord): PublicRecord {
  const normalized: PublicRecord = { ...item };
  for (const key of ["title", "description", "excerpt", "date", "badge", "venue", "name", "subtitle", "bio", "role", "focus", "degree", "major", "research", "graduation", "thesis", "destination", "tag", "specLine", "label", "value", "handle"]) {
    if (key in item) normalized[key] = text(item[key]);
  }
  for (const key of ["authors", "links", "contacts", "keywords", "specs"]) if (key in item) normalized[key] = array(item[key]).map(normalizeItem);
  return normalized;
}

function slugify(value: unknown) { return clean(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
function normalizeMember(item: PublicRecord) {
  const member = normalizeItem(item);
  const group = clean(item.group || item.groupKey) || "member";
  const name = text(item.name);
  member.group = group;
  member.slug = clean(item.slug) || `${group}-${slugify(name.en || name.zh) || "member"}`;
  if (["postdoc", "phd", "master", "undergrad"].includes(group)) {
    const degrees: Record<string, LocaleText> = { postdoc: { zh: "博士后", en: "Postdoc" }, phd: { zh: "博士", en: "PhD" }, master: { zh: "硕士", en: "Master" }, undergrad: { zh: "本科", en: "Undergraduate" } };
    member.degree = degrees[group];
  }
  return member;
}

export type PublicSiteService = ReturnType<typeof createPublicSiteService>;

export function createPublicSiteService(repository: PublicSiteRepository) {
  const page = async (key: string, fallback: PublicRecord): Promise<PublicRecord> => mergeLocalized(fallback, await repository.getPageContent(key));
  return {
    async getBootstrap() {
      const site = await page("site", defaults.site);
      return { brand: { name: site.brandName }, navigation: publicNavigation, header: { searchPlaceholder: { zh: "搜索论文...", en: "Search publications..." }, cta: { label: { zh: "查看论文", en: "Publications" }, href: "/research" } }, footer: { description: site.footerDescription, copyright: site.footerCopyright, links: array(site.footerLinks).map(normalizeItem) } };
    },
    getHome: () => page("home", defaults.home),
    async getResearch(): Promise<PublicRecord> { return { ...(await page("research_page", defaults.research)), publications: (await repository.getResearchItems()).map(normalizeItem) }; },
    async getNews(): Promise<PublicRecord> { return { ...(await page("news_page", defaults.news)), items: (await repository.getNewsItems()).map(normalizeItem) }; },
    async getTeam(): Promise<PublicRecord> {
      const config = await page("team_page", defaults.team);
      const members = (await repository.getTeamMembers()).map(normalizeMember);
      const group = (key: string) => members.filter((member) => member.group === key).sort((a, b) => clean(a.enrollmentYear).localeCompare(clean(b.enrollmentYear)) || Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
      const advisors = group("advisor");
      return { header: config.header, sectionTitles: config.sectionTitles, facultyLead: advisors[0] ?? null, advisors, postdocs: group("postdoc"), phdStudents: group("phd"), masterStudents: group("master"), undergraduateStudents: group("undergrad"), alumni: group("alumni"), recruitment: config.recruitment };
    },
    async getFacilities(): Promise<PublicRecord> {
      const config = await page("facilities_page", defaults.facilities);
      const legacyItems = (await repository.getFacilityItems()).map(normalizeItem);
      return { ...config, facilitySections: Array.isArray(config.facilitySections) && config.facilitySections.length ? config.facilitySections : legacyItems };
    },
    async getContact(): Promise<PublicRecord> { return { ...(await page("contact_page", defaults.contact)), ...(await repository.getContactItems()) }; }
  };
}
