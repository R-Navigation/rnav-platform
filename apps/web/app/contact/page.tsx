import { ContactPage } from "@/features/public-site/ContactPage";
import { PublicPage } from "@/features/public-site/PublicPage";
import { getPublicData } from "@/features/public-site/data";
import { contactFallback } from "@/features/public-site/fallbacks";

export default async function Page() {
  const data = await getPublicData("contact", contactFallback);
  return <PublicPage><ContactPage data={data}/></PublicPage>;
}
