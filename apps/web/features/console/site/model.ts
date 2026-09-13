export type SiteModule = {
  key: string;
  kind: "page" | "collection";
  label: string;
  endpoint: string;
  pageKey?: string;
  value: unknown;
  revision: string | null;
};

export type SitePermission = "site.content.write" | "site.members.write";

export type SiteModuleConflict = {
  moduleKey: string;
  draftValue: unknown;
  baselineValue: unknown;
  previousRevision: string | null;
};

export const adminRedirects = [
  { source: "/admin", destination: "/console/site", permanent: true },
  { source: "/admin/dashboard", destination: "/console/site", permanent: true }
];

const pageModules = [
  ["site", "品牌与导航", "site"], ["home", "首页", "home"], ["directions-page", "研究方向", "directions_page"], ["research-page", "论文成果", "research_page"],
  ["news-page", "新闻页面", "news_page"], ["team-page", "团队页面", "team_page"],
  ["facilities-page", "设备页面", "facilities_page"], ["contact-page", "联系页外观", "contact_page"]
] as const;
const collectionModules = [
  ["research-items", "论文库", "researchItems", "/research-items"],
  ["news-items", "新闻库", "newsItems", "/news-items"],
  ["facility-items", "旧版设备条目", "facilityItems", "/facility-items"],
  ["contact-items", "联系我们", "contactItems", "/contact-items"]
] as const;

function versioned(value: unknown, fallback: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const item = value as { content?: unknown; items?: unknown; updatedAt?: unknown; revision?: unknown };
    return {
      value: item.content ?? item.items ?? value,
      revision: typeof item.updatedAt === "string" ? item.updatedAt : typeof item.revision === "string" ? item.revision : null
    };
  }
  return { value: value ?? fallback, revision: null };
}

export function normalizeSiteAdminSnapshot(payload: unknown): SiteModule[] {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const pages = root.pages && typeof root.pages === "object" ? root.pages as Record<string, unknown> : root;
  const modules: SiteModule[] = pageModules.map(([key, label, pageKey]) => {
    const current = versioned(pages[pageKey], {});
    return { key, kind: "page", label, pageKey, endpoint: `/pages/${pageKey}`, ...current };
  });
  for (const [key, label, property, endpoint] of collectionModules) {
    const fallback = key === "contact-items" ? { primaryChannels: [], socialLinks: [], extraCards: [] } : [];
    const current = versioned(root[property], fallback);
    modules.push({ key, kind: "collection", label, endpoint, ...current });
  }
  return modules;
}

export function createSaveRequest(module: SiteModule) {
  return {
    endpoint: module.endpoint,
    body: module.kind === "page"
      ? { content: module.value, expectedUpdatedAt: module.revision }
      : { items: module.value, expectedUpdatedAt: module.revision }
  };
}

export function getRequiredPermission(module: SiteModule): SitePermission {
  return module.key === "team-members" ? "site.members.write" : "site.content.write";
}

export function getAvailableSiteModules(modules: SiteModule[], permissions?: string[]) {
  if (!permissions) return modules;
  const available = new Set(permissions);
  return modules.filter((module) => available.has(getRequiredPermission(module)));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function isModuleDirty(module: SiteModule, draftValue: unknown) {
  return stableJson(module.value) !== stableJson(draftValue);
}

export function isJsonEditorDirty(baselineValue: unknown, source: string) {
  return source !== JSON.stringify(baselineValue, null, 2);
}

export function getEditorInteractionState(conflictRefreshing: boolean) {
  return { busy: conflictRefreshing, disabled: conflictRefreshing };
}

export function applySavedModule(module: SiteModule, revision: string): SiteModule {
  return { ...module, revision };
}

export function applyConflictSnapshot(
  modules: SiteModule[],
  conflict: SiteModuleConflict,
  choice: "reload" | "keep-local",
) {
  const latestModule = modules.find((item) => item.key === conflict.moduleKey);
  if (!latestModule) throw new Error("最新快照中缺少当前模块。");
  return {
    modules,
    module: latestModule,
    draftValue: choice === "reload" ? latestModule.value : conflict.draftValue,
    serverValueChanged: isModuleDirty(latestModule, conflict.baselineValue),
  };
}

export function retainConflictAfterRefreshFailure(conflict: SiteModuleConflict, error: string) {
  return { conflict, error };
}

export type JsonParseResult = { ok: true; value: unknown } | { error: string; ok: false };

export function parseJsonEditorValue(source: string): JsonParseResult {
  try {
    return { ok: true, value: JSON.parse(source) as unknown };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "JSON 格式无效。", ok: false };
  }
}
