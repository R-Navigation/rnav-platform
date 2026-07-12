import "server-only";
import { getInternalApiUrl } from "@/lib/server/api";

export async function getPublicData<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(getInternalApiUrl(`/api/public/${path}`), { next: { revalidate: 60 } });
    if (!response.ok) return fallback;
    return await response.json() as T;
  } catch {
    return fallback;
  }
}

export const fallbackBootstrap = {
  brand: { name: { zh: "R-Nav 研究组", en: "R-Nav Research Group" } },
  navigation: [
    { key: "home", label: { zh: "首页", en: "Home" }, href: "/" },
    { key: "research", label: { zh: "研究", en: "Research" }, href: "/research" },
    { key: "team", label: { zh: "成员", en: "Team" }, href: "/team" },
    { key: "facilities", label: { zh: "实验平台", en: "Facilities" }, href: "/facilities" },
    { key: "news", label: { zh: "新闻", en: "News" }, href: "/news" },
    { key: "monitor", label: { zh: "监控", en: "Monitor" }, href: "/monitor" },
    { key: "contact", label: { zh: "联系", en: "Contact" }, href: "/contact" }
  ],
  footer: { description: { zh: "推进导航与具身智能研究。", en: "Advancing the frontiers of navigation and AI." }, copyright: { zh: "© 2024 R-Nav 研究组 | 武汉大学 LIESMARS", en: "© 2024 R-Nav Research Group | LIESMARS, Wuhan University" }, links: [] }
};
