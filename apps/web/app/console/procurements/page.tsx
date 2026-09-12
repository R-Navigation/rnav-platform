import { getConsoleBootstrap } from "@/features/console/bootstrap";
import { ProcurementConsole } from "@/features/procurement/ProcurementConsole";

export default async function ProcurementsPage({ searchParams }: { searchParams: Promise<{ scope?: string; view?: string }> }) {
  const result = await getConsoleBootstrap();
  const query = await searchParams;
  const initialMode = ["create", "review", "purchase"].includes(query.view ?? "")
    ? query.view as "create" | "review" | "purchase"
    : query.scope === "mine" ? "mine" : "default";
  return result.status === "authenticated" ? <ProcurementConsole initialMode={initialMode} permissions={result.data.permissions} userId={result.data.user.id}/> : null;
}
