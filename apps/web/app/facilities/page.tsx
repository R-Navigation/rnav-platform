import { FacilitiesPage } from "@/features/public-site/FacilitiesPage";
import { PublicPage } from "@/features/public-site/PublicPage";
import { fallbackBootstrap, getPublicData } from "@/features/public-site/data";
import { facilitiesFallback } from "@/features/public-site/fallbacks";

export default async function Page() {
  const bootstrapPromise = getPublicData("bootstrap", fallbackBootstrap);
  const dataPromise = getPublicData("facilities", facilitiesFallback);
  const [bootstrap, result] = await Promise.all([bootstrapPromise, dataPromise]);
  return <PublicPage bootstrap={bootstrap} degraded={result.degraded}><FacilitiesPage data={result.data}/></PublicPage>;
}
