import { NewsPage } from "@/features/public-site/NewsPage";
import { PublicPage } from "@/features/public-site/PublicPage";
import { fallbackBootstrap, getPublicData } from "@/features/public-site/data";
import { newsFallback } from "@/features/public-site/fallbacks";
import { publicMetadata } from "@/lib/publicMetadata";

export const metadata = publicMetadata(
  "News",
  "查看 RNAV 实验室的科研进展、团队活动与最新消息。",
  "/news",
);

export default async function Page() {
  const bootstrapPromise = getPublicData("bootstrap", fallbackBootstrap);
  const dataPromise = getPublicData("news", newsFallback);
  const [bootstrap, result] = await Promise.all([
    bootstrapPromise,
    dataPromise,
  ]);
  return (
    <PublicPage bootstrap={bootstrap} degraded={result.degraded}>
      <NewsPage data={result.data} />
    </PublicPage>
  );
}
