export type AccountDeletionDependency = {
  type: string;
  label: string;
  count: number;
  blocking: boolean;
};

export type AccountDeletionCheck = {
  deletable: boolean;
  target: {
    id: string;
    username: string;
    displayName: string;
    accountKind: "person" | "system";
    baseTier: "normal" | "super";
    status: string;
    lastLoginAt: string | null;
  };
  dependencies: AccountDeletionDependency[];
};

export const accountLifecycleCopy = {
  disable:
    "停用账号会保留成员资料和全部业务历史，仅阻止继续登录，之后可以恢复。",
  permanentDelete:
    "永久删除只适用于从未产生正式业务记录的测试或误建账号，删除后无法恢复。",
} as const;

export function canShowPermanentDelete(
  actorTier: string,
  canWriteUsers: boolean,
) {
  return actorTier === "super" && canWriteUsers;
}

export function canConfirmPermanentDelete(
  check: AccountDeletionCheck | null,
  confirmation: string,
) {
  return Boolean(
    check?.deletable && confirmation === check.target.username,
  );
}

export function removeDeletedMember<T extends { id: string }>(
  members: T[],
  deletedId: string,
) {
  return members.filter((member) => member.id !== deletedId);
}
