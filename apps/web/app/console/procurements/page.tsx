import { getConsoleBootstrap } from "@/features/console/bootstrap";
import { ProcurementConsole } from "@/features/procurement/ProcurementConsole";

export default async function ProcurementsPage() {
  const result = await getConsoleBootstrap();
  return result.status === "authenticated" ? <ProcurementConsole permissions={result.data.permissions} userId={result.data.user.id}/> : null;
}
