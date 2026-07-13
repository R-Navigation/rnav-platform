import { HomePage } from "@/features/public-site/HomePage";
import { PublicPage } from "@/features/public-site/PublicPage";
import { fallbackBootstrap, getOptionalPublicData, getPublicData } from "@/features/public-site/data";
import { homeFallback, newsFallback, researchFallback } from "@/features/public-site/fallbacks";
import { sanitizeMonitorPreview } from "@/features/public-site/monitor-preview";

export default async function Page() {
  const bootstrapPromise = getPublicData("bootstrap", fallbackBootstrap);
  const [bootstrap, home, research, news, rawMonitorPreview] = await Promise.all([
    bootstrapPromise,
    getPublicData("home", homeFallback),
    getPublicData("research", researchFallback),
    getPublicData("news", newsFallback),
    getOptionalPublicData("/api/monitor/public/homepage-snapshot?limit=6")
  ]);
  const degraded = home.degraded || research.degraded || news.degraded;
  return <PublicPage bootstrap={bootstrap} degraded={degraded}><HomePage data={{ home: home.data, research: research.data, news: news.data, monitorPreview: sanitizeMonitorPreview(rawMonitorPreview) }}/></PublicPage>;
}
