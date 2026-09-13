import { FacilitiesPage } from "@/features/public-site/FacilitiesPage";
import { PublicPage } from "@/features/public-site/PublicPage";
import { fallbackBootstrap, getPublicData } from "@/features/public-site/data";
import {
  facilitiesFallback,
  homeFallback,
} from "@/features/public-site/fallbacks";
import { publicMetadata } from "@/lib/publicMetadata";

export const metadata = publicMetadata(
  "Facilities",
  "浏览 RNAV 实验室的机器人平台、传感设备与科研基础设施。",
  "/facilities",
);

export default async function Page() {
  const bootstrapPromise = getPublicData("bootstrap", fallbackBootstrap);
  const dataPromise = getPublicData("facilities", facilitiesFallback);
  const [bootstrap, result, home] = await Promise.all([
    bootstrapPromise,
    dataPromise,
    getPublicData("home", homeFallback),
  ]);
  return (
    <PublicPage bootstrap={bootstrap} degraded={result.degraded}>
      <FacilitiesPage
        data={result.data}
        featuredIds={home.data.featuredFacilityIds}
      />
    </PublicPage>
  );
}
