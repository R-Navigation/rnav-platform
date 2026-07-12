import { HomePage } from "@/features/public-site/HomePage";
import { PublicPage } from "@/features/public-site/PublicPage";
import { getPublicData } from "@/features/public-site/data";
import { homeFallback } from "@/features/public-site/fallbacks";

export default async function Page() {
  const data = await getPublicData("home", homeFallback);
  return <PublicPage><HomePage data={data}/></PublicPage>;
}
