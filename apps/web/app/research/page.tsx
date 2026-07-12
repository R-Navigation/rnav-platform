import { PublicPage } from "@/features/public-site/PublicPage";
import { ResearchPage } from "@/features/public-site/ResearchPage";
import { getPublicData } from "@/features/public-site/data";
import { researchFallback } from "@/features/public-site/fallbacks";

export default async function Page() {
  const data = await getPublicData("research", researchFallback);
  return <PublicPage><ResearchPage data={data}/></PublicPage>;
}
