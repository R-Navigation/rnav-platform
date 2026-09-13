"use client";

import { useState } from "react";
import { ConsoleApiError, consoleApi } from "@/lib/consoleApi";
import { ConsoleAlert } from "@/features/console/ui/ConsoleAlert";
import { ConsoleButton } from "@/features/console/ui/ConsoleButton";
import { ConsoleIcon } from "@/features/console/ui/ConsoleIcon";
import { ConsoleDialog } from "@/features/console/ui/ConsoleOverlay";
import { ConsoleStatusBadge } from "@/features/console/ui/ConsoleStatusBadge";
import {
  accountLifecycleCopy,
  canConfirmPermanentDelete,
  type AccountDeletionCheck,
} from "./accountDeletion";

function deletionError(value: unknown) {
  if (value instanceof ConsoleApiError) {
    if (value.code === "USER_HAS_DEPENDENCIES")
      return "该账号仍有关联数据，无法永久删除。请停用账号或先解除相关业务关系。";
    if (value.code === "SELF_DELETE") return "不能永久删除当前登录账号。";
    if (value.code === "LAST_SUPER")
      return "不能删除最后一个启用的超级管理员。";
    if (value.code === "NOT_FOUND") return "该账号已不存在，请刷新成员列表。";
  }
  return value instanceof Error ? value.message : "永久删除检查失败。";
}

export function AccountDeletionPanel({
  userId,
  username,
  displayName,
  onDeleted,
}: {
  userId: string;
  username: string;
  displayName: string;
  onDeleted: (userId: string, username: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [check, setCheck] = useState<AccountDeletionCheck | null>(null);
  const [error, setError] = useState("");

  function close() {
    if (deleting) return;
    setOpen(false);
    setCheck(null);
    setConfirmation("");
    setError("");
  }

  async function beginCheck() {
    setOpen(true);
    setChecking(true);
    setCheck(null);
    setConfirmation("");
    setError("");
    try {
      setCheck(
        await consoleApi<AccountDeletionCheck>(
          `/api/users/${userId}/deletion-check`,
        ),
      );
    } catch (value) {
      setError(deletionError(value));
    } finally {
      setChecking(false);
    }
  }

  async function permanentlyDelete() {
    if (!canConfirmPermanentDelete(check, confirmation)) return;
    setDeleting(true);
    setError("");
    try {
      await consoleApi(`/api/users/${userId}`, { method: "DELETE" });
      setOpen(false);
      setCheck(null);
      setConfirmation("");
      await onDeleted(userId, username);
    } catch (value) {
      setError(deletionError(value));
    } finally {
      setDeleting(false);
    }
  }

  const blocking = check?.dependencies.filter((item) => item.blocking) ?? [];
  const removable = check?.dependencies.filter((item) => !item.blocking) ?? [];

  return (
    <>
      <section className="mt-8 rounded-xl border border-red-200 bg-red-50/40 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-red-800">
              <ConsoleIcon className="size-4" name="warning" />
              <h3 className="text-sm font-bold">危险操作</h3>
            </div>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              永久删除账号
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              {accountLifecycleCopy.permanentDelete}
              成员毕业或离组请转为校友；需要暂时禁止登录时请停用账号。
            </p>
          </div>
          <ConsoleButton
            className="shrink-0"
            onClick={() => void beginCheck()}
            variant="danger"
          >
            <ConsoleIcon name="trash" />
            检查并永久删除
          </ConsoleButton>
        </div>
      </section>

      <ConsoleDialog
        description={`正在处理 ${displayName}（@${username}）的账号。`}
        footer={
          <>
            <ConsoleButton disabled={deleting} onClick={close}>
              取消
            </ConsoleButton>
            {check?.deletable ? (
              <ConsoleButton
                disabled={
                  deleting ||
                  !canConfirmPermanentDelete(check, confirmation)
                }
                onClick={() => void permanentlyDelete()}
                variant="danger"
              >
                {deleting ? "正在永久删除…" : "永久删除账号"}
              </ConsoleButton>
            ) : null}
          </>
        }
        onClose={close}
        open={open}
        title="永久删除账号"
      >
        <div className="space-y-4">
          {checking ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
              正在检查账号关联数据…
            </div>
          ) : null}

          {error ? <ConsoleAlert tone="danger">{error}</ConsoleAlert> : null}

          {check && !check.deletable ? (
            <>
              <ConsoleAlert tone="danger" title="无法永久删除该账号">
                为保证业务历史和责任记录完整，请改用“停用账号”，或先解除仍有效的业务关系。
              </ConsoleAlert>
              <div className="overflow-hidden rounded-lg border border-red-100">
                {blocking.map((dependency) => (
                  <div
                    className="flex items-center justify-between gap-4 border-b border-red-100 px-4 py-3 last:border-0"
                    key={dependency.type}
                  >
                    <span className="text-sm text-slate-700">
                      {dependency.label}
                    </span>
                    <ConsoleStatusBadge tone="danger">
                      {dependency.count} 项
                    </ConsoleStatusBadge>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {check?.deletable ? (
            <>
              <ConsoleAlert tone="warning" title="此操作无法撤销">
                账号、成员资料、登录会话和账号级权限将被永久清除。原用户名和邮箱之后可以用于创建一个全新的账号，新账号会获得新的 UUID。
              </ConsoleAlert>
              {removable.length ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold text-slate-700">
                    将随账号清理或解除归因
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {removable.map((dependency) => (
                      <ConsoleStatusBadge key={dependency.type}>
                        {dependency.label} · {dependency.count}
                      </ConsoleStatusBadge>
                    ))}
                  </div>
                </div>
              ) : null}
              <label className="block text-sm font-semibold text-slate-800">
                输入用户名 <code className="text-red-700">{check.target.username}</code> 以确认
                <input
                  autoComplete="off"
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                  onChange={(event) => setConfirmation(event.target.value)}
                  placeholder={check.target.username}
                  spellCheck={false}
                  value={confirmation}
                />
              </label>
            </>
          ) : null}
        </div>
      </ConsoleDialog>
    </>
  );
}
