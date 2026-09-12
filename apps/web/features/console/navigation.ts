export type ConsoleNavigationModule = {
  href: string;
  key: string;
  label: string;
};

export type ConsoleNavigationGroup = {
  key: "mine" | "showcase" | "system";
  label: string;
  modules: ConsoleNavigationModule[];
};

const navigationGroups: Array<
  Omit<ConsoleNavigationGroup, "modules"> & { moduleKeys: string[] }
> = [
  {
    key: "mine",
    label: "我的事务",
    moduleKeys: ["profile", "lab-assets", "procurements"],
  },
  {
    key: "showcase",
    label: "实验与展示",
    moduleKeys: ["monitor", "site", "media"],
  },
  { key: "system", label: "系统管理", moduleKeys: ["members", "settings"] },
];

export function groupConsoleModules(
  modules: ConsoleNavigationModule[],
): ConsoleNavigationGroup[] {
  const normalized = modules.filter(
    (module) => module.key !== "users" && module.key !== "permissions",
  );
  if (
    modules.some(
      (module) => module.key === "users" || module.key === "permissions",
    )
  )
    normalized.push({
      key: "members",
      href: "/console/members",
      label: "成员管理",
    });
  return navigationGroups
    .map(({ moduleKeys, ...group }) => ({
      ...group,
      modules: moduleKeys.flatMap((key) =>
        normalized.filter((module) => module.key === key),
      ),
    }))
    .filter((group) => group.modules.length > 0);
}

export function isConsoleRouteActive(pathname: string, href: string) {
  return (
    pathname === href ||
    (href !== "/console" && pathname.startsWith(`${href}/`))
  );
}
