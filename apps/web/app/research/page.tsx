import { PublicPage } from "@/features/public-site/PublicPage";
import { ResearchPage } from "@/features/public-site/ResearchPage";
import { fallbackBootstrap, getPublicData } from "@/features/public-site/data";
import { researchFallback } from "@/features/public-site/fallbacks";

export default async function Page() {
  const bootstrapPromise = getPublicData("bootstrap", fallbackBootstrap);
  const dataPromise = getPublicData("research", researchFallback);
  const [bootstrap, result] = await Promise.all([bootstrapPromise, dataPromise]);
  return <PublicPage bootstrap={bootstrap} degraded={result.degraded}><ResearchPage data={result.data}/></PublicPage>;
}
