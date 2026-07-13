import { getConsoleBootstrap } from "@/features/console/bootstrap";
import { ConsoleMonitor } from "@/features/monitor/ConsoleMonitor";

export default async function ConsoleMonitorPage() {
  const result = await getConsoleBootstrap();
  return <ConsoleMonitor permissions={result.status === "authenticated" ? result.data.permissions : []}/>;
}
