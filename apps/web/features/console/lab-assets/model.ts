export type LocalizedText = { en: string; zh: string };
export type LabNote = { content: LocalizedText; id: string; sortOrder: number };
export type LabPlatform = {
  assets: string[];
  code: string;
  description: LocalizedText;
  name: LocalizedText;
  notes: LabNote[];
  sortOrder: number;
  status: "active" | "partial" | "empty" | "maintenance" | "lend";
  typeCode: string | null;
};
export type LabPlatformType = {
  code: string;
  description: LocalizedText;
  name: LocalizedText;
  platforms: LabPlatform[];
  sortOrder: number;
};
export type LabAsset = {
  code: string;
  currentPlatformCode: string | null;
  description: LocalizedText;
  deviceType: LocalizedText;
  model: string;
  name: LocalizedText;
  notes: LabNote[];
  shareScope: string;
  sortOrder: number;
  status: "idle" | "mounted" | "maintenance" | "retired" | "lend";
  vendorSerial: string;
};
export type LabAssetsSnapshot = {
  assets: LabAsset[];
  page: Record<string, unknown>;
  platforms: LabPlatform[];
  platformTypes: LabPlatformType[];
  revision: string;
  stats: Record<string, number>;
};
export type AssetFilters = { platform: string; query: string; status: string };
export const labAssetsRedirects = [{ source: "/lab-assets", destination: "/console/lab-assets", permanent: true }];

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("实验室资产数据格式无效。");
  return value as Record<string, unknown>;
}

function localized(value: unknown): LocalizedText {
  const item = object(value);
  if (typeof item.zh !== "string" || typeof item.en !== "string") throw new Error("实验室资产数据格式无效。");
  return { zh: item.zh, en: item.en };
}

function notes(value: unknown): LabNote[] {
  if (!Array.isArray(value)) throw new Error("实验室资产数据格式无效。");
  return value.map((entry) => {
    const item = object(entry);
    if (typeof item.id !== "string" || typeof item.sortOrder !== "number") throw new Error("实验室资产数据格式无效。");
    return { id: item.id, sortOrder: item.sortOrder, content: localized(item.content) };
  });
}

function platform(value: unknown): LabPlatform {
  const item = object(value);
  const assetCodes = Array.isArray(item.assetCodes) ? item.assetCodes : item.assets;
  if (typeof item.code !== "string" || typeof item.sortOrder !== "number" || typeof item.status !== "string" || !Array.isArray(assetCodes)) {
    throw new Error("实验室资产数据格式无效。");
  }
  return {
    assets: assetCodes.filter((code): code is string => typeof code === "string"),
    code: item.code,
    description: localized(item.description),
    name: localized(item.name),
    notes: notes(item.notes),
    sortOrder: item.sortOrder,
    status: item.status as LabPlatform["status"],
    typeCode: typeof item.typeCode === "string" ? item.typeCode : null,
  };
}

function platformType(value: unknown): LabPlatformType {
  const item = object(value);
  if (typeof item.code !== "string" || typeof item.sortOrder !== "number" || !Array.isArray(item.platforms)) {
    throw new Error("实验室资产数据格式无效。");
  }
  return { code: item.code, description: localized(item.description), name: localized(item.name), platforms: item.platforms.map(platform), sortOrder: item.sortOrder };
}

function asset(value: unknown): LabAsset {
  const item = object(value);
  if (typeof item.code !== "string" || typeof item.model !== "string" || typeof item.vendorSerial !== "string" || typeof item.status !== "string" || typeof item.shareScope !== "string" || typeof item.sortOrder !== "number") {
    throw new Error("实验室资产数据格式无效。");
  }
  return {
    code: item.code,
    currentPlatformCode: typeof item.currentPlatformCode === "string" ? item.currentPlatformCode : null,
    description: localized(item.description),
    deviceType: localized(item.deviceType),
    model: item.model,
    name: localized(item.name),
    notes: notes(item.notes),
    shareScope: item.shareScope,
    sortOrder: item.sortOrder,
    status: item.status as LabAsset["status"],
    vendorSerial: item.vendorSerial,
  };
}

export function normalizeLabAssetsSnapshot(value: unknown): LabAssetsSnapshot {
  const item = object(value);
  if (typeof item.revision !== "string" || !Array.isArray(item.assets) || !Array.isArray(item.platformTypes)) {
    throw new Error("实验室资产数据格式无效。");
  }
  const platformTypes = item.platformTypes.map(platformType);
  const platforms = Array.isArray(item.platforms) && item.platforms.length
    ? item.platforms.map(platform)
    : platformTypes.flatMap((type) => type.platforms);
  const statsValue = object(item.stats);
  const stats = Object.fromEntries(Object.entries(statsValue).filter((entry): entry is [string, number] => typeof entry[1] === "number"));
  return { assets: item.assets.map(asset), page: object(item.page), platforms, platformTypes, revision: item.revision, stats };
}

export function canWriteLabAssets(permissions: string[]) {
  return permissions.includes("lab_assets.write");
}

export function applyRevision(snapshot: LabAssetsSnapshot, revision: string): LabAssetsSnapshot {
  return { ...snapshot, revision };
}

export function filterAssets(assets: LabAsset[], filters: AssetFilters) {
  const query = filters.query.trim().toLocaleLowerCase();
  return assets.filter((item) => {
    const matchesStatus = filters.status === "all" || item.status === filters.status;
    const matchesPlatform = filters.platform === "all"
      || (filters.platform === "unassigned" ? !item.currentPlatformCode : item.currentPlatformCode === filters.platform);
    const haystack = [item.code, item.model, item.vendorSerial, item.name.zh, item.name.en, item.deviceType.zh, item.deviceType.en].join(" ").toLocaleLowerCase();
    return matchesStatus && matchesPlatform && (!query || haystack.includes(query));
  });
}
