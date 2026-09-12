import { PublicPage } from "@/features/public-site/PublicPage";
import { ResearchPage } from "@/features/public-site/ResearchPage";
import { fallbackBootstrap, getPublicData } from "@/features/public-site/data";
import { researchFallback } from "@/features/public-site/fallbacks";
import { publicMetadata } from "@/lib/publicMetadata";

export const metadata = publicMetadata("Research", "了解 RNAV 实验室在机器人、导航与自主系统领域的研究方向和科研成果。", "/research");

export default async function Page() {
  const bootstrapPromise = getPublicData("bootstrap", fallbackBootstrap);
  const dataPromise = getPublicData("research", researchFallback);
  const [bootstrap, result] = await Promise.all([bootstrapPromise, dataPromise]);
  return <PublicPage bootstrap={bootstrap} degraded={result.degraded}><ResearchPage data={result.data}/></PublicPage>;
}
