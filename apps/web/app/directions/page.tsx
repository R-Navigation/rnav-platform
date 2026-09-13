import { PublicPage } from "@/features/public-site/PublicPage";
import { fallbackBootstrap, getPublicData } from "@/features/public-site/data";
import {
  directionsFallback,
  researchFallback,
  facilitiesFallback,
} from "@/features/public-site/fallbacks";
import { publicMetadata } from "@/lib/publicMetadata";
import { DirectionsPage } from "@/features/public-site/DirectionsPage";

export const metadata = publicMetadata(
  "Research Directions",
  "RNAV 研究方向：机器人定位、建图、导航与协同。",
  "/directions",
);

export default async function Page() {
  const [bootstrap, directions, research, facilities] = await Promise.all([
    getPublicData("bootstrap", fallbackBootstrap),
    getPublicData("directions", directionsFallback),
    getPublicData("research", researchFallback),
    getPublicData("facilities", facilitiesFallback),
  ]);
  return (
    <PublicPage
      bootstrap={bootstrap}
      degraded={directions.degraded || research.degraded || facilities.degraded}
    >
      <DirectionsPage
        directions={directions.data}
        research={research.data}
        facilities={facilities.data}
      />
    </PublicPage>
  );
}
