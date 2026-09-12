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
import { publicMetadata } from "@/lib/publicMetadata";

export const metadata = publicMetadata("RNAV Lab", "RNAV 实验室的研究方向、团队成员、科研设施与最新动态。", "/");

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
