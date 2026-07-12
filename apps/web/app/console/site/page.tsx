import { getConsoleBootstrap } from "@/features/console/bootstrap";
import { SiteContentConsole } from "@/features/console/site/SiteContentConsole";

export default async function SitePage() {
  const result = await getConsoleBootstrap();
  return <SiteContentConsole permissions={result.status === "authenticated" ? result.data.permissions : []} />;
}
