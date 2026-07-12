import { HomePage } from "@/features/public-site/HomePage";
import { PublicPage } from "@/features/public-site/PublicPage";
import { getOptionalPublicData, getPublicData } from "@/features/public-site/data";
import { homeFallback, newsFallback, researchFallback } from "@/features/public-site/fallbacks";
import { sanitizeMonitorPreview } from "@/features/public-site/monitor-preview";

export default async function Page() {
  const [home, research, news, rawMonitorPreview] = await Promise.all([
    getPublicData("home", homeFallback),
    getPublicData("research", researchFallback),
    getPublicData("news", newsFallback),
    getOptionalPublicData("/monitor/api/public/homepage-snapshot?limit=6")
  ]);
  return <PublicPage><HomePage data={{ home, research, news, monitorPreview: sanitizeMonitorPreview(rawMonitorPreview) }}/></PublicPage>;
}
