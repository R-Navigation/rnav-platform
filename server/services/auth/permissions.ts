export type BaseTier = "normal" | "super";
export type DisplayTier = "normal" | "plus" | "super";

export type ConsoleModule = {
  key: string;
  href: string;
  label: string;
  requiredAny: string[];
};

export const knownPermissionKeys = [
  "console.access",
  "profile.read_own",
  "profile.write_own",
  "lab_assets.read",
  "procurements.create",
  "procurements.read_own",
  "site.content.write",
  "site.members.write",
  "site.media.write",
  "monitor.devices.read",
  "monitor.devices.write",
  "monitor.settings.write",
  "lab_assets.write",
  "procurements.read_all",
  "procurements.review",
  "procurements.purchase",
  "procurements.close",
  "users.read",
  "users.write",
  "permissions.write",
  "system.settings.write"
] as const;

export const basePermissionKeys = [
  "console.access",
  "profile.read_own",
  "profile.write_own",
  "lab_assets.read",
  "procurements.create",
  "procurements.read_own"
] as const;

const basePermissions = new Set<string>(basePermissionKeys);

export type PermissionSource =
  | { type: "base" }
  | { type: "super" }
  | { type: "template"; templateKey: string }
  | { type: "grant" }
  | { type: "revoke" };

export type PermissionResolutionInput = {
  baseTier?: BaseTier;
  templatePermissions?: Array<{ permissionKey: string; templateKey: string }>;
  explicitGrants?: string[];
  explicitRevokes?: string[];
};

export function resolvePermissions({
  baseTier = "normal",
  templatePermissions = [],
  explicitGrants = [],
  explicitRevokes = []
}: PermissionResolutionInput) {
  const sources: Record<string, PermissionSource[]> = {};
  if (baseTier === "super") {
    for (const key of knownPermissionKeys) sources[key] = [{ type: "super" }];
    return { permissions: [...knownPermissionKeys], sources };
  }

  const effective = new Set<string>();
  for (const key of basePermissionKeys) {
    effective.add(key);
    sources[key] = [{ type: "base" }];
  }
  for (const item of templatePermissions) {
    if (!knownPermissionKeys.includes(item.permissionKey as never)) continue;
    effective.add(item.permissionKey);
    sources[item.permissionKey] ??= [];
    sources[item.permissionKey].push({ type: "template", templateKey: item.templateKey });
  }
  for (const key of explicitGrants) {
    if (!knownPermissionKeys.includes(key as never)) continue;
    effective.add(key);
    sources[key] ??= [];
    sources[key].push({ type: "grant" });
  }
  for (const key of explicitRevokes) {
    if (!knownPermissionKeys.includes(key as never) || basePermissions.has(key)) continue;
    effective.delete(key);
    sources[key] = [{ type: "revoke" }];
  }
  if (["procurements.review", "procurements.purchase", "procurements.close"].some((key) => effective.has(key))) {
    effective.add("procurements.read_all");
    sources["procurements.read_all"] ??= [{ type: "grant" }];
  }
  return { permissions: [...effective], sources };
}

const moduleDefinitions: ConsoleModule[] = [
  {
    key: "profile",
    href: "/console/profile",
    label: "个人资料",
    requiredAny: ["console.access", "profile.read_own", "profile.write_own"]
  },
  {
    key: "lab-assets",
    href: "/console/lab-assets",
    label: "实验室资产",
    requiredAny: ["lab_assets.read", "lab_assets.write"]
  },
  {
    key: "procurements",
    href: "/console/procurements",
    label: "采购申请",
    requiredAny: [
      "procurements.create",
      "procurements.read_own",
      "procurements.read_all",
      "procurements.review",
      "procurements.purchase",
      "procurements.close"
    ]
  },
  {
    key: "monitor",
    href: "/console/monitor",
    label: "监控管理",
    requiredAny: [
      "monitor.devices.read",
      "monitor.devices.write",
      "monitor.settings.write"
    ]
  },
  {
    key: "site",
    href: "/console/site",
    label: "官网内容",
    requiredAny: ["site.content.write", "site.members.write"]
  },
  {
    key: "media",
    href: "/console/media",
    label: "媒体资源",
    requiredAny: ["site.media.write"]
  },
  {
    key: "users",
    href: "/console/users",
    label: "用户管理",
    requiredAny: ["users.read", "users.write"]
  },
  {
    key: "permissions",
    href: "/console/permissions",
    label: "权限管理",
    requiredAny: ["permissions.write"]
  },
  {
    key: "settings",
    href: "/console/settings",
    label: "系统设置",
    requiredAny: ["system.settings.write"]
  }
];

export function deriveDisplayTier(
  baseTier: BaseTier,
  permissions: string[]
): DisplayTier {
  if (baseTier === "super") {
    return "super";
  }

  return permissions.some((permission) => !basePermissions.has(permission))
    ? "plus"
    : "normal";
}

export function getEffectivePermissions(
  permissions: string[],
  baseTier: BaseTier = "normal"
) {
  return resolvePermissions({ baseTier, explicitGrants: permissions }).permissions;
}

export function getConsoleModules(
  permissions: string[],
  baseTier: BaseTier = "normal"
) {
  const permissionSet = new Set(getEffectivePermissions(permissions, baseTier));
  return moduleDefinitions
    .filter((module) =>
      module.requiredAny.some((permission) => permissionSet.has(permission))
    )
    .map(({ requiredAny: _requiredAny, ...module }) => module);
}
