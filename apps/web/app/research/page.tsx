import { PublicPage } from "@/features/public-site/PublicPage";
import { ResearchPage } from "@/features/public-site/ResearchPage";
import { fallbackBootstrap, getPublicData } from "@/features/public-site/data";
import {
  researchFallback,
  homeFallback,
  facilitiesFallback,
} from "@/features/public-site/fallbacks";
import { flattenFacilities } from "@/features/public-site/ui4/content";
import { publicMetadata } from "@/lib/publicMetadata";

export const metadata = publicMetadata(
  "Publications",
  "浏览 RNAV 研究组的论文成果，按年份、研究主题和成果类型查找公开论文。",
  "/research",
);

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string | string[] }>;
}) {
  const bootstrapPromise = getPublicData("bootstrap", fallbackBootstrap);
  const dataPromise = getPublicData("research", researchFallback);
  const [bootstrap, result, home, facilities, params] = await Promise.all([
    bootstrapPromise,
    dataPromise,
    getPublicData("home", { ...homeFallback, featuredPublicationId: "" }),
    getPublicData("facilities", facilitiesFallback),
    searchParams,
  ]);
  const initialTopic = typeof params.topic === "string" ? params.topic : "all";
  return (
    <PublicPage bootstrap={bootstrap} degraded={result.degraded}>
      <ResearchPage
        key={initialTopic}
        initialTopic={initialTopic}
        data={result.data}
        featuredId={
          home.data.featuredResearchIds?.[0] || home.data.featuredPublicationId
        }
        heroImage={flattenFacilities(facilities.data)[0]?.image}
      />
    </PublicPage>
  );
}
