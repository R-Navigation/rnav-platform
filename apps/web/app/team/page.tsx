import { PublicPage } from "@/features/public-site/PublicPage";
import { TeamPage } from "@/features/public-site/TeamPage";
import { fallbackBootstrap, getPublicData } from "@/features/public-site/data";
import { teamFallback } from "@/features/public-site/fallbacks";

export default async function Page() {
  const bootstrapPromise = getPublicData("bootstrap", fallbackBootstrap);
  const dataPromise = getPublicData("team", teamFallback);
  const [bootstrap, result] = await Promise.all([bootstrapPromise, dataPromise]);
  return <PublicPage bootstrap={bootstrap} degraded={result.degraded}><TeamPage data={result.data}/></PublicPage>;
}
