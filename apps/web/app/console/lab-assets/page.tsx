import { getConsoleBootstrap } from "@/features/console/bootstrap";
import { LabAssetsConsole } from "@/features/console/lab-assets/LabAssetsConsole";

export default async function LabAssetsPage({ searchParams }: { searchParams: Promise<{ view?: string; asset?: string }> }) {
  const result = await getConsoleBootstrap();
  const params=await searchParams; const requestedView = params.view;
  const initialView = ["overview", "platforms", "assets", "requests"].includes(requestedView ?? "")
    ? requestedView as "overview" | "platforms" | "assets" | "requests"
    : "overview";
  return result.status === "authenticated" ? <LabAssetsConsole initialAssetCode={params.asset} initialView={params.asset?"assets":initialView} permissions={result.data.permissions} userId={result.data.user.id} /> : null;
}
