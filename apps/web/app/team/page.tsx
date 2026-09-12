import { PublicPage } from "@/features/public-site/PublicPage";
import { TeamPage } from "@/features/public-site/TeamPage";
import { fallbackBootstrap, getPublicData } from "@/features/public-site/data";
import { teamFallback } from "@/features/public-site/fallbacks";
import { publicMetadata } from "@/lib/publicMetadata";

export const metadata = publicMetadata("Team", "认识 RNAV 实验室的导师、研究人员、在组学生与校友。", "/team");

export default async function Page() {
  const bootstrapPromise = getPublicData("bootstrap", fallbackBootstrap);
  const dataPromise = getPublicData("team", teamFallback);
  const [bootstrap, result] = await Promise.all([bootstrapPromise, dataPromise]);
  return <PublicPage bootstrap={bootstrap} degraded={result.degraded}><TeamPage data={result.data}/></PublicPage>;
}
