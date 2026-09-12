import { getConsoleBootstrap } from "@/features/console/bootstrap";
import { LabAssetsConsole } from "@/features/console/lab-assets/LabAssetsConsole";

export default async function LabAssetsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const result = await getConsoleBootstrap();
  const requestedView = (await searchParams).view;
  const initialView = ["overview", "platforms", "assets", "requests"].includes(requestedView ?? "")
    ? requestedView as "overview" | "platforms" | "assets" | "requests"
    : "overview";
  return result.status === "authenticated" ? <LabAssetsConsole initialView={initialView} permissions={result.data.permissions} userId={result.data.user.id} /> : null;
}
