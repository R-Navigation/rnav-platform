import { HomePage } from "@/features/public-site/HomePage";
import { PublicPage } from "@/features/public-site/PublicPage";
import {
  fallbackBootstrap,
  getOptionalPublicData,
  getPublicData,
} from "@/features/public-site/data";
import {
  contactFallback,
  facilitiesFallback,
  homeFallback,
  newsFallback,
  researchFallback,
  teamFallback,
} from "@/features/public-site/fallbacks";
import { sanitizeMonitorPreview } from "@/features/public-site/monitor-preview";

export default async function Page() {
  const bootstrapPromise = getPublicData("bootstrap", fallbackBootstrap);
  const [bootstrap, homepage, rawMonitorPreview] = await Promise.all([
    bootstrapPromise,
    getPublicData("homepage", {
      home: homeFallback,
      research: researchFallback,
      facilities: facilitiesFallback,
      team: teamFallback,
      news: newsFallback,
      contact: contactFallback,
    }),
    getOptionalPublicData("/api/monitor/public/homepage-snapshot?limit=6"),
  ]);
  const degraded = homepage.degraded;
  return (
    <PublicPage bootstrap={bootstrap} degraded={degraded}>
      <HomePage
        data={{
          ...homepage.data,
          monitorPreview: sanitizeMonitorPreview(rawMonitorPreview),
        }}
      />
    </PublicPage>
  );
}
