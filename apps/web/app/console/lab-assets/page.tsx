import { getConsoleBootstrap } from "@/features/console/bootstrap";
import { LabAssetsConsole } from "@/features/console/lab-assets/LabAssetsConsole";

export default async function LabAssetsPage() {
  const result = await getConsoleBootstrap();
  return <LabAssetsConsole permissions={result.status === "authenticated" ? result.data.permissions : []} />;
}
