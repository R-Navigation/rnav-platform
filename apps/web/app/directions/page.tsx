import { PublicPage } from "@/features/public-site/PublicPage";
import { fallbackBootstrap, getPublicData } from "@/features/public-site/data";
import {
  homeFallback,
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
  const [bootstrap, home, research, facilities] = await Promise.all([
    getPublicData("bootstrap", fallbackBootstrap),
    getPublicData("home", homeFallback),
    getPublicData("research", researchFallback),
    getPublicData("facilities", facilitiesFallback),
  ]);
  return (
    <PublicPage
      bootstrap={bootstrap}
      degraded={home.degraded || research.degraded || facilities.degraded}
    >
      <DirectionsPage
        home={home.data}
        research={research.data}
        facilities={facilities.data}
      />
    </PublicPage>
  );
}
