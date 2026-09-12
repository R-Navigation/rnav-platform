import { getConsoleBootstrap } from "@/features/console/bootstrap";
import { MemberManagement } from "@/features/console/members/MemberManagement";

export default async function MemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, result] = await Promise.all([params, getConsoleBootstrap()]);
  return result.status === "authenticated" ? (
    <MemberManagement
      actorId={result.data.user.id}
      actorTier={result.data.user.tier}
      initialMemberId={id}
      permissions={result.data.permissions}
    />
  ) : null;
}
