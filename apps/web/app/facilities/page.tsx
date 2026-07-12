import { FacilitiesPage } from "@/features/public-site/FacilitiesPage";
import { PublicPage } from "@/features/public-site/PublicPage";
import { getPublicData } from "@/features/public-site/data";
import { facilitiesFallback } from "@/features/public-site/fallbacks";

export default async function Page() {
  const data = await getPublicData("facilities", facilitiesFallback);
  return <PublicPage><FacilitiesPage data={data}/></PublicPage>;
}
