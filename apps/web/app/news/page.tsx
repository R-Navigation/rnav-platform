import { NewsPage } from "@/features/public-site/NewsPage";
import { PublicPage } from "@/features/public-site/PublicPage";
import { getPublicData } from "@/features/public-site/data";
import { newsFallback } from "@/features/public-site/fallbacks";

export default async function Page() {
  const data = await getPublicData("news", newsFallback);
  return <PublicPage><NewsPage data={data}/></PublicPage>;
}
