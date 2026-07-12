import { ConsoleHome } from "@/features/console/ConsoleHome";
import { getConsoleBootstrap } from "@/features/console/bootstrap";

export default async function ConsolePage() {
  const result = await getConsoleBootstrap();

  if (result.status !== "authenticated") {
    return null;
  }

  return <ConsoleHome bootstrap={result.data} />;
}
