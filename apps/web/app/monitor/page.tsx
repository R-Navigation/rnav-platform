import { PublicPage } from "@/features/public-site/PublicPage";
import { fallbackBootstrap, getPublicData } from "@/features/public-site/data";
import { PublicMonitor } from "@/features/monitor/PublicMonitor";

export default async function MonitorPage() {
  const bootstrap = await getPublicData("bootstrap", fallbackBootstrap);
  return <PublicPage bootstrap={bootstrap}><PublicMonitor /></PublicPage>;
}
