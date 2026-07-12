import { PublicPage } from "@/features/public-site/PublicPage";
import { TeamPage } from "@/features/public-site/TeamPage";
import { getPublicData } from "@/features/public-site/data";
import { teamFallback } from "@/features/public-site/fallbacks";

export default async function Page() {
  const data = await getPublicData("team", teamFallback);
  return <PublicPage><TeamPage data={data}/></PublicPage>;
}
