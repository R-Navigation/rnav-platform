import "server-only";
import { getInternalApiUrl } from "@/lib/server/api";

export type PublicDataResult<T> = { data: T; degraded: boolean };

export async function getPublicData<T>(path: string, fallback: T): Promise<PublicDataResult<T>> {
  const endpoint = `/api/public/${path}`;
  try {
    const response = await fetch(getInternalApiUrl(endpoint), { next: { revalidate: 60 } });
    if (!response.ok) {
      console.error(`[public-site] ${endpoint} returned ${response.status}`);
      return { data: fallback, degraded: true };
    }
    return { data: await response.json() as T, degraded: false };
  } catch (error) {
    console.error(`[public-site] ${endpoint} request failed`, error instanceof Error ? error.name : "UnknownError");
    return { data: fallback, degraded: true };
  }
}

export async function getOptionalPublicData(path: string): Promise<unknown | null> {
  try {
    const response = await fetch(getInternalApiUrl(path), { next: { revalidate: 30 } });
    if (!response.ok) return null;
    return await response.json() as unknown;
  } catch (error) {
    console.error(`[public-site] ${path} optional request failed`, error instanceof Error ? error.name : "UnknownError");
    return null;
  }
}

export const fallbackBootstrap = {
  brand: { name: { zh: "R-Nav 研究组", en: "R-Nav Research Group" } },
  navigation: [
    { key: "home", label: { zh: "首页", en: "Home" }, href: "/" },
    { key: "directions", label: { zh: "研究方向", en: "Directions" }, href: "/directions" },
    { key: "research", label: { zh: "论文成果", en: "Publications" }, href: "/research" },
    { key: "facilities", label: { zh: "实验平台", en: "Facilities" }, href: "/facilities" },
    { key: "team", label: { zh: "团队成员", en: "Team" }, href: "/team" },
    { key: "news", label: { zh: "新闻动态", en: "News" }, href: "/news" },
    { key: "contact", label: { zh: "联系我们", en: "Contact" }, href: "/contact" }
  ],
  footer: { description: { zh: "推进导航与具身智能研究。", en: "Advancing the frontiers of navigation and AI." }, copyright: { zh: "© 2024 R-Nav 研究组 | 武汉大学 LIESMARS", en: "© 2024 R-Nav Research Group | LIESMARS, Wuhan University" }, links: [] }
};
