import { getConsoleBootstrap } from "@/features/console/bootstrap";
import { LabAssetsConsole } from "@/features/console/lab-assets/LabAssetsConsole";

export default async function LabAssetsPage() {
  const result = await getConsoleBootstrap();
  return result.status === "authenticated" ? <LabAssetsConsole permissions={result.data.permissions} userId={result.data.user.id} /> : null;
}
