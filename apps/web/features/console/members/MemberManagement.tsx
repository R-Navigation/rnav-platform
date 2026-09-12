"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { consoleApi } from "@/lib/consoleApi";
import { MemberProfileEditor } from "./MemberProfileEditor";
import { MemberImportDialog } from "./MemberImportDialog";
import { AccountEmailEditor } from "./AccountEmailEditor";

export type Member = {
  id: string;
  username: string;
  email: string;
  displayName: string;
  nameZh: string;
  nameEn: string;
  baseTier: "normal" | "super";
  tier: "normal" | "plus" | "super";
  status: "active" | "disabled" | "invited";
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  publicVisible: boolean;
  memberStatus: "current" | "alumni";
  memberCategory: string;
  degreeLevel: string;
  researchInterestsZh: string;
  homepageUrl: string;
  templateKeys: string[];
  publicEmail: string; phone: string; bioZh: string; bioEn: string; researchInterestsEn: string;
  enrollmentYear: string; graduationYear: string; majorZh: string; majorEn: string; thesisZh: string; thesisEn: string;
  destinationZh: string; destinationEn: string; avatarAssetId: string | null; avatarPositionX: number; avatarPositionY: number;
  avatarZoom: number; personalLinks: Array<{labelZh:string;labelEn:string;url:string}>; publicFields: string[]; version: number;
  profileContentUpdatedAt: string; completeness: { complete: boolean; publishable: boolean; missing: string[] };
};
type Catalog = {
  permissions: Array<{
    key: string;
    nameZh: string;
    descriptionZh: string;
    category: string;
    isAdvanced: boolean;
  }>;
  templates: Array<{
    key: string;
    nameZh: string;
    descriptionZh: string;
    permissionKeys: string[];
  }>;
};
type PermissionDetail = {
  user: Pick<
    Member,
    "id" | "username" | "displayName" | "baseTier" | "tier" | "status"
  >;
  templateKeys: string[];
  grants: string[];
  revokes: string[];
  effectivePermissions: string[];
  sources: Record<string, Array<{ type: string; templateKey?: string }>>;
  consoleModules: Array<{ key: string; label: string }>;
};
type AuditEntry = {
  id: string;
  action: string;
  detail: Record<string, unknown>;
  createdAt: string;
  actorName: string;
};
type Tab = "profile" | "account" | "roles" | "security" | "audit";

const input =
  "w-full border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-700";
const primary =
  "bg-blue-950 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-400";
const secondary =
  "border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-cyan-700 disabled:opacity-40";
const categories: Record<string, string> = {
  advisor: "导师",
  postdoc: "博士后",
  phd: "博士生",
  master: "硕士生",
  undergrad: "本科生",
  alumni: "校友",
};
const auditLabels: Record<string, string> = {
  "user.create": "创建成员账号",
  "user.status": "变更账号状态",
  "user.tier": "变更基础身份",
  "user.public_profile": "变更官网展示",
  "user.password.reset": "重置密码",
  "user.sessions.revoke": "撤销全部会话",
  "permissions.replace": "更新角色与权限",
};

export function MemberManagement({
  actorId,
  actorTier,
  initialMemberId,
  permissions,
  initialProfileFilter,
}: {
  actorId: string;
  actorTier: string;
  initialMemberId?: string;
  permissions: string[];
  initialProfileFilter?: string;
}) {
  const canWriteUsers = permissions.includes("users.write");
  const canWritePermissions = permissions.includes("permissions.write");
  const canWriteMembers = permissions.includes("site.members.write");
  const [members, setMembers] = useState<Member[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [selectedId, setSelectedId] = useState(initialMemberId ?? "");
  const [tab, setTab] = useState<Tab>("profile");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [memberCategory, setMemberCategory] = useState("");
  const [role, setRole] = useState("");
  const [profileFilter,setProfileFilter]=useState(["complete","incomplete","stale"].includes(initialProfileFilter??"")?initialProfileFilter!:"");
  const [visibilityFilter,setVisibilityFilter]=useState("");
  const [loginFilter,setLoginFilter]=useState("");
  const [detail, setDetail] = useState<PermissionDetail | null>(null);
  const [templates, setTemplates] = useState<string[]>([]);
  const [decisions, setDecisions] = useState<
    Record<string, "inherit" | "grant" | "revoke">
  >({});
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(
    null,
  );

  const loadMembers = useCallback(async () => {
    const query = new URLSearchParams();
    if (search) query.set("search", search);
    if (status) query.set("status", status);
    if(profileFilter)query.set("profile",profileFilter);
    if(visibilityFilter)query.set("publicVisibility",visibilityFilter);
    if(loginFilter)query.set("login",loginFilter);
    const result = await consoleApi<{ users: Member[] }>(`/api/users?${query}`);
    setMembers(result.users);
    setSelectedId(
      (current) => current || initialMemberId || result.users[0]?.id || "",
    );
  }, [initialMemberId, search, status,profileFilter,visibilityFilter,loginFilter]);

  useEffect(() => {
    void Promise.all([
      loadMembers(),
      canWritePermissions
        ? consoleApi<Catalog>("/api/permissions/catalog").then(setCatalog)
        : Promise.resolve(),
    ]).catch((value) =>
      setError(value instanceof Error ? value.message : "无法加载成员资料。"),
    );
  }, [canWritePermissions, loadMembers]);

  useEffect(() => {
    if (!selectedId) return;
    setError("");
    const assignments = canWritePermissions
      ? consoleApi<PermissionDetail>(`/api/permissions/users/${selectedId}`)
      : Promise.resolve(null);
    void Promise.all([
      assignments,
      consoleApi<{ audit: AuditEntry[] }>(`/api/users/${selectedId}/audit`),
    ])
      .then(([permissionDetail, auditResult]) => {
        setDetail(permissionDetail);
        setAudit(auditResult.audit);
        if (permissionDetail) {
          setTemplates(
            permissionDetail.templateKeys.includes("normal-member")
              ? permissionDetail.templateKeys
              : ["normal-member", ...permissionDetail.templateKeys],
          );
          setDecisions(
            Object.fromEntries(
              (catalog?.permissions ?? []).map((permission) => [
                permission.key,
                permissionDetail.revokes.includes(permission.key)
                  ? "revoke"
                  : permissionDetail.grants.includes(permission.key)
                    ? "grant"
                    : "inherit",
              ]),
            ),
          );
        }
      })
      .catch((value) =>
        setError(value instanceof Error ? value.message : "无法加载成员详情。"),
      );
  }, [canWritePermissions, catalog, selectedId]);

  const visibleMembers = useMemo(
    () =>
      members.filter((member) => {
        if (memberCategory && member.memberCategory !== memberCategory)
          return false;
        if (role && !member.templateKeys.includes(role)) return false;
        return true;
      }),
    [memberCategory, members, role],
  );
  const selected = members.find((member) => member.id === selectedId) ?? null;

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      await loadMembers();
      setMessage(success);
    } catch (value) {
      setError(value instanceof Error ? value.message : "操作失败。");
    } finally {
      setBusy(false);
    }
  }

  async function createMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const result = await consoleApi<{
        id: string;
        temporaryPassword: string;
      }>("/api/users", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(form)),
      });
      setTemporaryPassword(result.temporaryPassword);
      setSelectedId(result.id);
      setShowCreate(false);
    }, "成员账号已创建。");
  }

  async function savePermissions() {
    if (!detail) return;
    await run(async () => {
      const next = await consoleApi<PermissionDetail>(
        `/api/permissions/users/${detail.user.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            templateKeys: [...new Set(["normal-member", ...templates])],
            grants: Object.keys(decisions).filter(
              (key) => decisions[key] === "grant",
            ),
            revokes: Object.keys(decisions).filter(
              (key) => decisions[key] === "revoke",
            ),
          }),
        },
      );
      setDetail(next);
    }, "角色与权限已保存，目标账号的旧会话已失效。");
  }

  return (
    <section aria-labelledby="members-heading">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-300 pb-5">
        <div>
          <p className="text-sm font-semibold text-cyan-800">
            账号、资料与岗位权限
          </p>
          <h1
            className="mt-1 font-serif text-3xl font-bold text-blue-950"
            id="members-heading"
          >
            成员管理
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            围绕成员统一管理账号生命周期与岗位职责；成员自行维护的学术资料仅供查看。
          </p>
        </div>
        {canWriteUsers ? <div className="flex gap-2"><button className={secondary} onClick={()=>setShowImport(true)} type="button">批量导入</button><button className={primary} onClick={() => setShowCreate(true)} type="button">+ 创建成员</button></div> : null}
      </header>
      {error ? (
        <p
          className="mt-4 border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {message ? (
        <p
          className="mt-4 border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
          role="status"
        >
          {message}
        </p>
      ) : null}
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <input
          className={input}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="搜索姓名 / 用户名 / 邮箱"
          value={search}
        />
        <select
          className={input}
          onChange={(event) => setStatus(event.target.value)}
          value={status}
        >
          <option value="">全部账号状态</option>
          <option value="active">启用</option>
          <option value="disabled">停用</option>
          <option value="invited">待首次登录</option>
        </select>
        <select className={input} value={profileFilter} onChange={(event)=>setProfileFilter(event.target.value)}><option value="">全部资料状态</option><option value="complete">资料完整</option><option value="incomplete">资料待完善</option><option value="stale">超过一年未复核</option></select>
        <select className={input} value={visibilityFilter} onChange={(event)=>setVisibilityFilter(event.target.value)}><option value="">全部公开状态</option><option value="public">官网展示</option><option value="private">官网隐藏</option></select>
        <select className={input} value={loginFilter} onChange={(event)=>setLoginFilter(event.target.value)}><option value="">全部登录状态</option><option value="never">从未登录</option><option value="active">半年内登录</option><option value="stale">半年未登录</option></select>
        <select
          className={input}
          onChange={(event) => setMemberCategory(event.target.value)}
          value={memberCategory}
        >
          <option value="">全部成员类别</option>
          {Object.entries(categories).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          className={input}
          onChange={(event) => setRole(event.target.value)}
          value={role}
        >
          <option value="">全部岗位角色</option>
          {catalog?.templates.map((template) => (
            <option key={template.key} value={template.key}>
              {template.nameZh}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="border border-slate-200 bg-white xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto">
          <div className="sticky top-0 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
            {visibleMembers.length} 位成员
          </div>
          <div className="divide-y divide-slate-200">
            {visibleMembers.map((member) => (
              <button
                className={`w-full border-l-4 p-4 text-left ${selectedId === member.id ? "border-cyan-700 bg-cyan-50" : "border-transparent hover:bg-slate-50"}`}
                key={member.id}
                onClick={() => {
                  setSelectedId(member.id);
                  setTab("profile");
                  window.history.replaceState(
                    null,
                    "",
                    `/console/members/${member.id}`,
                  );
                }}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <strong className="text-sm text-blue-950">
                      {member.displayName}
                    </strong>
                    <p className="mt-1 text-xs text-slate-500">
                      @{member.username} · {member.email}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-1 text-[11px] font-bold ${member.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}
                  >
                    {member.status === "active"
                      ? "启用"
                      : member.status === "disabled"
                        ? "停用"
                        : "待首次登录"}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {member.templateKeys.slice(0, 3).map((key) => (
                    <span
                      className="bg-slate-100 px-2 py-1 text-[11px] text-slate-600"
                      key={key}
                    >
                      {catalog?.templates.find(
                        (template) => template.key === key,
                      )?.nameZh ?? key}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
          {!visibleMembers.length ? (
            <p className="p-5 text-sm text-slate-500">没有匹配的成员。</p>
          ) : null}
        </aside>
        {selected ? (
          <main className="min-w-0 border border-slate-200 bg-white">
            <div className="flex flex-wrap items-start justify-between gap-4 p-5 lg:p-6">
              <div>
                <p className="text-xs text-cyan-800">
                  {categories[selected.memberCategory] ??
                    selected.memberCategory}{" "}
                  · {selected.memberStatus === "alumni" ? "校友" : "在组"}
                </p>
                <h2 className="mt-1 text-2xl font-bold text-blue-950">
                  {selected.nameZh || selected.displayName}
                  <span className="ml-2 text-base font-normal text-slate-500">
                    {selected.nameEn}
                  </span>
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  @{selected.username}
                </p>
              </div>
              <span
                className={`px-3 py-2 text-xs font-bold ${selected.publicVisible ? "bg-cyan-100 text-cyan-800" : "bg-slate-100 text-slate-600"}`}
              >
                {selected.publicVisible ? "官网展示中" : "官网未展示"}
              </span>
            </div>
            <nav
              className="flex overflow-x-auto border-y border-slate-200 bg-slate-50"
              aria-label="成员详情"
            >
              {(
                [
                  ["profile", "成员资料"],
                  ["account", "账号"],
                  ["roles", "角色与权限"],
                  ["security", "安全"],
                  ["audit", "操作记录"],
                ] as const
              )
                .filter(([key]) => key !== "roles" || canWritePermissions)
                .map(([key, label]) => (
                  <button
                    className={`shrink-0 border-b-2 px-4 py-3 text-sm font-semibold ${tab === key ? "border-cyan-700 text-cyan-800" : "border-transparent text-slate-600"}`}
                    key={key}
                    onClick={() => setTab(key)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
            </nav>
            <div className="p-5 lg:p-6">
              {tab === "profile" ? (
                <MemberProfileEditor busy={busy} canEdit={canWriteMembers} member={selected} onConvert={()=>run(()=>consoleApi(`/api/users/${selected.id}/convert-alumni`,{method:"POST",body:JSON.stringify({confirm:true})}),"已转换为校友，岗位权限和旧会话已清理。")} onSave={(body)=>run(()=>consoleApi(`/api/users/${selected.id}/profile`,{method:"PUT",body:JSON.stringify(body)}),"成员资料已保存。")} />
              ) : null}
              {tab === "account" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Info label="用户名" value={selected.username} />
                  <AccountEmailEditor busy={busy} canEdit={canWriteUsers} email={selected.email} onSave={(email)=>run(()=>consoleApi(`/api/users/${selected.id}/account-email`,{method:"PUT",body:JSON.stringify({email})}),"账号邮箱已更新。")} />
                  <Info label="账号状态" value={selected.status} />
                  <Info
                    label="首次登录改密"
                    value={selected.mustChangePassword ? "需要" : "已完成"}
                  />
                  <Info
                    label="最近登录"
                    value={
                      selected.lastLoginAt
                        ? new Date(selected.lastLoginAt).toLocaleString("zh-CN")
                        : "尚未登录"
                    }
                  />
                  <Info
                    label="创建时间"
                    value={new Date(selected.createdAt).toLocaleString("zh-CN")}
                  />
                </div>
              ) : null}
              {tab === "roles" && canWritePermissions && catalog && detail ? (
                <div>
                  <h3 className="font-bold text-blue-950">岗位角色</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    日常管理只需选择岗位模板。普通成员是不可撤销的基础能力。
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {catalog.templates.map((template) => (
                      <label
                        className="border border-slate-200 p-4 text-sm"
                        key={template.key}
                      >
                        <input
                          checked={
                            template.key === "normal-member" ||
                            templates.includes(template.key)
                          }
                          className="mr-2"
                          disabled={template.key === "normal-member" || busy}
                          onChange={(event) =>
                            setTemplates(
                              event.target.checked
                                ? [...templates, template.key]
                                : templates.filter(
                                    (key) => key !== template.key,
                                  ),
                            )
                          }
                          type="checkbox"
                        />
                        <b>{template.nameZh}</b>
                        <span className="mt-2 block text-xs leading-5 text-slate-500">
                          {template.descriptionZh}
                        </span>
                      </label>
                    ))}
                  </div>
                  <button
                    className={`${secondary} mt-6`}
                    onClick={() => setAdvanced((value) => !value)}
                    type="button"
                  >
                    {advanced ? "收起高级权限设置" : "高级权限设置"}
                  </button>
                  {advanced ? (
                    <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
                      {catalog.permissions.map((permission) => (
                        <div
                          className="grid gap-3 py-4 lg:grid-cols-[1fr_260px] lg:items-center"
                          key={permission.key}
                        >
                          <div>
                            <b className="text-sm text-blue-950">
                              {permission.nameZh}
                            </b>
                            <code className="ml-2 text-xs text-slate-400">
                              {permission.key}
                            </code>
                            <p className="mt-1 text-xs text-slate-500">
                              {permission.descriptionZh}
                            </p>
                            <p className="mt-1 text-xs text-cyan-700">
                              来源：
                              {(detail.sources[permission.key] ?? [])
                                .map((source) =>
                                  source.type === "template"
                                    ? `模板 ${source.templateKey}`
                                    : source.type,
                                )
                                .join("、") || "无"}
                            </p>
                          </div>
                          <div className="flex border border-slate-300">
                            {(["inherit", "grant", "revoke"] as const).map(
                              (decision) => (
                                <button
                                  className={`flex-1 px-3 py-2 text-xs ${decisions[permission.key] === decision ? "bg-blue-950 text-white" : "bg-white text-slate-600"} ${!permission.isAdvanced && decision === "revoke" ? "cursor-not-allowed opacity-30" : ""}`}
                                  disabled={
                                    !permission.isAdvanced &&
                                    decision === "revoke"
                                  }
                                  key={decision}
                                  onClick={() =>
                                    setDecisions((current) => ({
                                      ...current,
                                      [permission.key]: decision,
                                    }))
                                  }
                                  type="button"
                                >
                                  {decision === "inherit"
                                    ? "继承"
                                    : decision === "grant"
                                      ? "授予"
                                      : "撤销"}
                                </button>
                              ),
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <button
                    className={`${primary} mt-6`}
                    disabled={busy}
                    onClick={() => void savePermissions()}
                    type="button"
                  >
                    保存角色与权限
                  </button>
                </div>
              ) : null}
              {tab === "security" ? (
                <div>
                  <p className="text-sm text-slate-600">
                    敏感操作会保留审计记录；密码重置后旧会话立即失效，临时密码只显示一次。
                  </p>
                  {canWriteUsers ? (
                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        className={secondary}
                        disabled={
                          busy ||
                          selected.id === actorId ||
                          (selected.baseTier === "super" &&
                            actorTier !== "super")
                        }
                        onClick={() =>
                          void run(
                            () =>
                              consoleApi(`/api/users/${selected.id}/status`, {
                                method: "PUT",
                                body: JSON.stringify({
                                  status:
                                    selected.status === "active"
                                      ? "disabled"
                                      : "active",
                                }),
                              }),
                            selected.status === "active"
                              ? "账号已停用。"
                              : "账号已恢复。",
                          )
                        }
                        type="button"
                      >
                        {selected.status === "active" ? "停用账号" : "恢复账号"}
                      </button>
                      <button
                        className={secondary}
                        disabled={
                          busy ||
                          (selected.baseTier === "super" &&
                            actorTier !== "super")
                        }
                        onClick={() =>
                          void run(async () => {
                            const result = await consoleApi<{
                              temporaryPassword: string;
                            }>(`/api/users/${selected.id}/reset-password`, {
                              method: "POST",
                            });
                            setTemporaryPassword(result.temporaryPassword);
                          }, "密码已重置。")
                        }
                        type="button"
                      >
                        重置密码
                      </button>
                      <button
                        className={secondary}
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () =>
                              consoleApi(
                                `/api/users/${selected.id}/revoke-sessions`,
                                { method: "POST" },
                              ),
                            "全部会话已撤销。",
                          )
                        }
                        type="button"
                      >
                        撤销全部会话
                      </button>
                      {actorTier === "super" ? (
                        <button
                          className={secondary}
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () =>
                                consoleApi(`/api/users/${selected.id}/tier`, {
                                  method: "PUT",
                                  body: JSON.stringify({
                                    baseTier:
                                      selected.baseTier === "super"
                                        ? "normal"
                                        : "super",
                                  }),
                                }),
                              "基础身份已更新。",
                            )
                          }
                          type="button"
                        >
                          {selected.baseTier === "super"
                            ? "降为普通账号"
                            : "升为超级管理员"}
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-slate-500">
                      你没有账号安全管理权限。
                    </p>
                  )}
                </div>
              ) : null}
              {tab === "audit" ? (
                <div className="divide-y divide-slate-200 border-y border-slate-200">
                  {audit.map((entry) => (
                    <article
                      className="grid gap-2 py-4 sm:grid-cols-[1fr_auto]"
                      key={entry.id}
                    >
                      <div>
                        <strong className="text-sm text-blue-950">
                          {auditLabels[entry.action] ?? entry.action}
                        </strong>
                        <p className="mt-1 text-xs text-slate-500">
                          操作人：{entry.actorName}
                        </p>
                      </div>
                      <time className="text-xs text-slate-500">
                        {new Date(entry.createdAt).toLocaleString("zh-CN")}
                      </time>
                    </article>
                  ))}
                  {!audit.length ? (
                    <p className="py-6 text-sm text-slate-500">
                      暂无操作记录。
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </main>
        ) : (
          <main className="grid min-h-96 place-items-center border border-dashed border-slate-300 text-sm text-slate-500">
            请选择成员。
          </main>
        )}
      </div>
      {showImport?<MemberImportDialog busy={busy} onClose={()=>setShowImport(false)} onImport={(rows)=>run(async()=>{const result=await consoleApi<{imported:number;credentials:Array<{username:string;temporaryPassword:string}>}>("/api/users/import",{method:"POST",body:JSON.stringify({rows})});setTemporaryPassword(result.credentials.map((item)=>`${item.username}: ${item.temporaryPassword}`).join("\n"));setShowImport(false);},"成员已批量导入；临时密码仅显示本次。")}/>:null}
      {showCreate ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            className="w-full max-w-xl bg-white p-6"
            onSubmit={createMember}
          >
            <div className="flex justify-between">
              <h2 className="font-serif text-2xl text-blue-950">
                创建成员账号
              </h2>
              <button onClick={() => setShowCreate(false)} type="button">
                关闭
              </button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {[
                ["username", "用户名"],
                ["nameZh", "中文姓名"],
                ["nameEn", "英文姓名"],
                ["email", "邮箱"],
              ].map(([name, label]) => (
                <label className="text-sm" key={name}>
                  {label}
                  <input
                    className={`${input} mt-1`}
                    name={name}
                    required={name !== "nameEn"}
                  />
                </label>
              ))}
              <label className="text-sm">
                成员类别
                <select className={`${input} mt-1`} name="memberCategory">
                  {Object.entries(categories).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {actorTier === "super" ? (
                <label className="text-sm">
                  基础身份
                  <select className={`${input} mt-1`} name="baseTier">
                    <option value="normal">普通账号</option>
                    <option value="super">超级管理员</option>
                  </select>
                </label>
              ) : null}
            </div>
            <button className={`${primary} mt-6`} disabled={busy}>
              确认创建
            </button>
          </form>
        </div>
      ) : null}
      {temporaryPassword ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg bg-white p-6">
            <h2 className="font-serif text-2xl text-blue-950">
              一次性临时密码
            </h2>
            <p className="mt-3 text-sm text-slate-600">
              请通过安全渠道交给成员。关闭后无法再次查看。
            </p>
            <code className="mt-5 block whitespace-pre-wrap break-all border border-slate-300 bg-slate-50 p-4 text-lg">
              {temporaryPassword}
            </code>
            <button
              className={`${primary} mt-6`}
              onClick={() => setTemporaryPassword(null)}
              type="button"
            >
              我已记录并关闭
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="border border-slate-200 p-4">
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="mt-2 break-words text-sm font-semibold text-slate-900">
        {value || "未设置"}
      </dd>
    </div>
  );
}
