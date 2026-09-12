import { PublicPage } from "@/features/public-site/PublicPage";
import { fallbackBootstrap, getPublicData } from "@/features/public-site/data";
import { PublicMonitor } from "@/features/monitor/PublicMonitor";
import { publicMetadata } from "@/lib/publicMetadata";

export const metadata = publicMetadata("Monitor", "查看 RNAV 实验室公开设备与机器人平台的实时运行概览。", "/monitor");

export default async function MonitorPage() {
  const bootstrap = await getPublicData("bootstrap", fallbackBootstrap);
  return <PublicPage bootstrap={bootstrap}><PublicMonitor /></PublicPage>;
}
