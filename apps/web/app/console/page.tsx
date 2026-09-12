import { ConsoleHome } from "@/features/console/ConsoleHome";
import { getConsoleBootstrap } from "@/features/console/bootstrap";
import { getConsoleDashboard } from "@/features/console/dashboard";

export default async function ConsolePage() {
  const result = await getConsoleBootstrap();

  if (result.status !== "authenticated") {
    return null;
  }

  const dashboard = await getConsoleDashboard();
  return <ConsoleHome bootstrap={result.data} dashboard={dashboard} />;
}
