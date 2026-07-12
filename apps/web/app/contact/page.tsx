import { ContactPage } from "@/features/public-site/ContactPage";
import { PublicPage } from "@/features/public-site/PublicPage";
import { fallbackBootstrap, getPublicData } from "@/features/public-site/data";
import { contactFallback } from "@/features/public-site/fallbacks";

export default async function Page() {
  const bootstrapPromise = getPublicData("bootstrap", fallbackBootstrap);
  const dataPromise = getPublicData("contact", contactFallback);
  const [bootstrap, result] = await Promise.all([bootstrapPromise, dataPromise]);
  return <PublicPage bootstrap={bootstrap} degraded={result.degraded}><ContactPage data={result.data}/></PublicPage>;
}
