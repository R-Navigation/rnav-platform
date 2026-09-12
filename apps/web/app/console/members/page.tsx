import { getConsoleBootstrap } from "@/features/console/bootstrap";
import { MemberManagement } from "@/features/console/members/MemberManagement";

export default async function MembersPage() {
  const result = await getConsoleBootstrap();
  return result.status === "authenticated" ? (
    <MemberManagement
      actorId={result.data.user.id}
      actorTier={result.data.user.tier}
      permissions={result.data.permissions}
    />
  ) : null;
}
