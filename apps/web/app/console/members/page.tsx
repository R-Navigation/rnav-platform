import { getConsoleBootstrap } from "@/features/console/bootstrap";
import { MemberManagement } from "@/features/console/members/MemberManagement";

export default async function MembersPage({searchParams}:{searchParams:Promise<{profile?:string}>}) {
  const result = await getConsoleBootstrap();
  return result.status === "authenticated" ? (
    <MemberManagement
      actorId={result.data.user.id}
      actorTier={result.data.user.tier}
      permissions={result.data.permissions}
      initialProfileFilter={(await searchParams).profile}
    />
  ) : null;
}
