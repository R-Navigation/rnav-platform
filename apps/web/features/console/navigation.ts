export type ConsoleNavigationModule = {
  href: string;
  key: string;
  label: string;
};

export function isConsoleRouteActive(pathname: string, href: string) {
  return pathname === href || (href !== "/console" && pathname.startsWith(`${href}/`));
}
