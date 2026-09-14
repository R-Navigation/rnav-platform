"use client";
import Image from "next/image";
import { MemberCard } from "@/features/public-site/ui4/MemberCard";
import { memberPreview } from "./memberPreview";
import { useEffect, useRef, useState } from "react";
import { ConsoleApiError, consoleApi } from "@/lib/consoleApi";
import { RNAV_BRAND_ASSETS } from "@/lib/brand";
import type { Member } from "./MemberManagement";
import { academicStageLabels, publicProfileFieldGroups, type AcademicStage } from "./profileModel";
import { personIdentityFromChineseName } from "./memberIdentity";

const field =
  "w-full border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-700";
const labels: Record<string, string> = {
  name: "姓名",
  avatar: "头像",
  academicStage: "学术身份",
  major: "专业",
  research: "研究方向",
  enrollmentYear: "入组年份",
  graduationYear: "毕业年份",
  destination: "毕业去向",
};
export function MemberProfileEditor({
  member,
  busy,
  canEdit,
  onSave,
  onReload,
  onConvert,
}: {
  member: Member;
  busy: boolean;
  canEdit: boolean;
  onSave: (body: Record<string, unknown>) => Promise<Partial<Member>>;
  onReload: () => Promise<Partial<Member>>;
  onConvert: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(member);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error" | "conflict">("idle");
  const [saveError, setSaveError] = useState("");
  const memberIdRef = useRef(member.id);
  useEffect(() => {
    const selectedMemberChanged = memberIdRef.current !== member.id;
    setDraft((current) => selectedMemberChanged || member.version > current.version ? member : current);
    if (selectedMemberChanged) {
      memberIdRef.current = member.id;
      setUploadError("");
      setSaveState("idle");
      setSaveError("");
    }
  }, [member]);
  const update = (key: keyof Member, value: unknown) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const updateIdentity = (nameZh: string) => setDraft((current) => {
    if (current.accountKind !== "person") return { ...current, nameZh };
    const identity = personIdentityFromChineseName(nameZh);
    return { ...current, nameZh, nameEn: identity?.nameEn ?? "", username: identity?.username ?? current.username };
  });
  const save = async () => {
    setSaveState("saving");
    setSaveError("");
    try {
      const saved = await onSave({
      version: draft.version,
      memberStatus: draft.memberStatus,
      academicStage: draft.academicStage,
      nameZh: draft.nameZh,
      nameEn: draft.nameEn,
      publicEmail: draft.publicEmail,
      phone: draft.phone,
      bioZh: draft.bioZh,
      bioEn: draft.bioEn,
      researchInterestsZh: draft.researchInterestsZh,
      researchInterestsEn: draft.researchInterestsEn,
      enrollmentYear: draft.enrollmentYear,
      graduationYear: draft.graduationYear,
      majorZh: draft.majorZh,
      majorEn: draft.majorEn,
      thesisZh: draft.thesisZh,
      thesisEn: draft.thesisEn,
      destinationZh: draft.destinationZh,
      destinationEn: draft.destinationEn,
      avatarAssetId: draft.avatarAssetId,
      avatarPositionX: draft.avatarPositionX,
      avatarPositionY: draft.avatarPositionY,
      avatarZoom: draft.avatarZoom,
      personalLinks: draft.personalLinks,
      publicFields: draft.publicFields,
      publicVisible: draft.publicVisible,
      });
      setDraft((current) => ({ ...current, ...saved }));
      setSaveState("saved");
    } catch (reason) {
      if (reason instanceof ConsoleApiError && reason.code === "VERSION_CONFLICT") {
        setSaveState("conflict");
        setSaveError("成员资料已在其他位置更新。");
      } else {
        setSaveState("error");
        setSaveError(reason instanceof Error ? reason.message : "保存失败");
      }
    }
  };
  const reload = async () => {
    const latest = await onReload();
    setDraft((current) => ({ ...current, ...latest }));
    setSaveState("idle");
    setSaveError("");
  };
  const uploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const data = new FormData();
      data.append("file", file);
      const asset = await consoleApi<{ id: string; url: string }>(
        "/api/media/upload",
        { method: "POST", body: data },
      );
      setDraft((current) => ({
        ...current,
        avatarAssetId: asset.id,
        avatarUrl: asset.url,
        avatarPositionX: 50,
        avatarPositionY: 50,
        avatarZoom: 1,
      }));
    } catch (reason) {
      setUploadError((reason as Error).message);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };
  const preview = memberPreview(draft);
  const [previewLocale, setPreviewLocale] = useState<"zh" | "en">("zh");
  return (
    <div>
      <div
        className={`mb-5 border p-4 text-sm ${draft.completeness.complete ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}
      >
        <b>{draft.completeness.complete ? "资料完整" : "资料待完善"}</b>
        {draft.completeness.missing.length ? (
          <span>
            {" "}
            · 缺少{" "}
            {draft.completeness.missing
              .map((key) => labels[key] ?? key)
              .join("、")}
          </span>
        ) : null}
        <span className="ml-2">
          · 上次内容更新{" "}
          {new Date(draft.profileContentUpdatedAt).toLocaleDateString("zh-CN")}
        </span>
      </div>
      {draft.publicVisible && !draft.completeness.complete ? (
        <p className="mb-5 border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          该成员已公开展示，但仍缺少：
          {draft.completeness.missing
            .map((key) => labels[key] ?? key)
            .join("、")}
          。仍可保存，建议先完善。
        </p>
      ) : null}
      {uploadError ? (
        <p className="mb-5 border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {uploadError}
        </p>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(260px,.65fr)]">
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="grid gap-4 border border-slate-200 p-4 sm:col-span-2 sm:grid-cols-[128px_1fr]">
            <div>
              {draft.avatarUrl ? (
                <AvatarPreview member={draft} />
              ) : (
                <div className="grid aspect-square w-32 place-items-center bg-slate-100 text-xs text-slate-500">
                  尚未上传头像
                </div>
              )}
            </div>
            <div>
              <h3 className="font-semibold text-blue-950">成员头像与裁剪</h3>
              <p className="mt-1 text-xs text-slate-600">
                支持 JPG、PNG、WebP；上传后调整显示区域，再保存成员资料。
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <label className="cursor-pointer bg-blue-950 px-3 py-2 text-xs font-semibold text-white">
                  {uploading
                    ? "上传中…"
                    : draft.avatarUrl
                      ? "重新上传"
                      : "上传头像"}
                  <input
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    disabled={!canEdit || busy || uploading}
                    onChange={uploadAvatar}
                    type="file"
                  />
                </label>
                {draft.avatarAssetId ? (
                  <button
                    className="border border-slate-300 px-3 py-2 text-xs"
                    disabled={!canEdit || busy || uploading}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        avatarAssetId: null,
                        avatarUrl: null,
                      }))
                    }
                    type="button"
                  >
                    移除头像
                  </button>
                ) : null}
              </div>
              {draft.avatarUrl ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <Range
                    label="水平位置"
                    value={draft.avatarPositionX}
                    min={0}
                    max={100}
                    onChange={(value) => update("avatarPositionX", value)}
                  />
                  <Range
                    label="垂直位置"
                    value={draft.avatarPositionY}
                    min={0}
                    max={100}
                    onChange={(value) => update("avatarPositionY", value)}
                  />
                  <Range
                    label="缩放"
                    value={draft.avatarZoom}
                    min={1}
                    max={3}
                    step={0.05}
                    onChange={(value) => update("avatarZoom", value)}
                  />
                </div>
              ) : null}
            </div>
          </section>
          <label className="text-sm">
            用户名
            <input className={`${field} mt-1 bg-slate-100 font-mono`} disabled value={draft.username} />
            <span className="mt-1 block text-xs text-slate-500">中文姓名的完整拼音，姓在前，保存姓名时同步更新。</span>
          </label>
          <label className="text-sm">
            中文姓名
            <input className={`${field} mt-1`} disabled={!canEdit || busy} value={draft.nameZh} onChange={(event) => updateIdentity(event.target.value)} />
          </label>
          <label className="text-sm">
            英文姓名
            <input className={`${field} mt-1 ${draft.accountKind === "person" ? "bg-slate-100" : ""}`} disabled={!canEdit || busy} readOnly={draft.accountKind === "person"} value={draft.nameEn} onChange={(event) => update("nameEn", event.target.value)} />
            {draft.accountKind === "person" ? <span className="mt-1 block text-xs text-slate-500">按“名-姓”自动生成。</span> : null}
          </label>
          {(
            [
              ["publicEmail", "公开联系邮箱"],
              ["phone", "联系电话"],
              ["enrollmentYear", "入组年份"],
              ["graduationYear", "毕业年份"],
              ["majorZh", "专业（中文）"],
              ["majorEn", "专业（英文）"],
              ["researchInterestsZh", "研究方向（中文）"],
              ["researchInterestsEn", "研究方向（英文）"],
              ["destinationZh", "毕业去向（中文）"],
              ["destinationEn", "毕业去向（英文）"],
            ] as const
          ).map(([key, label]) => (
            <label className="text-sm" key={key}>
              {label}
              <input
                className={`${field} mt-1`}
                disabled={!canEdit || busy}
                value={String(draft[key] ?? "")}
                onChange={(event) => update(key, event.target.value)}
              />
            </label>
          ))}
          <label className="text-sm">
            成员状态
            <select
              className={`${field} mt-1`}
              disabled={!canEdit || busy}
              value={draft.memberStatus}
              onChange={(event) => update("memberStatus", event.target.value)}
            >
              <option value="current">在组</option>
              <option value="alumni">校友</option>
            </select>
          </label>
          <label className="text-sm">
            学术身份
            <select
              className={`${field} mt-1`}
              disabled={!canEdit || busy}
              value={draft.academicStage}
              onChange={(event) => update("academicStage", event.target.value as AcademicStage)}
            >
              {Object.entries(academicStageLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-3 border border-slate-200 p-4 text-sm font-semibold sm:col-span-2">
            <input
              checked={draft.publicVisible}
              disabled={!canEdit || busy}
              type="checkbox"
              onChange={(event) =>
                update("publicVisible", event.target.checked)
              }
            />
            在官网公开展示该成员
          </label>
          <fieldset className="border border-slate-200 p-4 sm:col-span-2">
            <legend className="px-1 text-xs font-semibold text-slate-500">官网公开内容</legend>
            <p className="mb-4 text-xs leading-5 text-slate-500">“学术身份”只控制卡片或详情中的显式文字；成员所在分组仍由学术身份决定。</p>
            <div className="grid gap-5 md:grid-cols-3">
              {publicProfileFieldGroups.map((group) => (
                <section key={group.label}>
                  <h4 className="mb-2 text-xs font-bold text-blue-950">{group.label}</h4>
                  <div className="space-y-2">
                    {[...group.fields]
                      .sort(([left]) => draft.memberStatus === "alumni"
                        ? (["graduation_year", "thesis", "destination"].includes(left) ? -1 : 0)
                        : (left === "enrollment_year" ? -1 : 0))
                      .map(([key, label]) => (
                        <label className="flex items-center gap-2 text-xs" key={key}>
                          <input
                            checked={draft.publicFields.includes(key)}
                            disabled={!canEdit || busy}
                            type="checkbox"
                            onChange={(event) => update("publicFields", event.target.checked
                              ? [...draft.publicFields, key]
                              : draft.publicFields.filter((item) => item !== key))}
                          />
                          {label}
                        </label>
                      ))}
                  </div>
                </section>
              ))}
            </div>
          </fieldset>
          {(
            [
              ["bioZh", "个人简介（中文）"],
              ["bioEn", "个人简介（英文）"],
              ["thesisZh", "论文题目（中文）"],
              ["thesisEn", "论文题目（英文）"],
            ] as const
          ).map(([key, label]) => (
            <label className="text-sm sm:col-span-2" key={key}>
              {label}
              <textarea
                className={`${field} mt-1 min-h-24`}
                disabled={!canEdit || busy}
                value={draft[key]}
                onChange={(event) => update(key, event.target.value)}
              />
            </label>
          ))}
          <section className="sm:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-blue-950">
                  个人链接
                </h3>
                <p className="mt-1 text-xs text-slate-600">
                  个人主页、GitHub、Google Scholar 等公开链接。
                </p>
              </div>
              <button
                className="border border-slate-300 px-3 py-2 text-xs font-semibold"
                disabled={!canEdit || busy}
                onClick={() =>
                  update("personalLinks", [
                    ...draft.personalLinks,
                    { labelZh: "", labelEn: "", url: "" },
                  ])
                }
                type="button"
              >
                新增链接
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {draft.personalLinks.map((link, index) => (
                <div
                  className="grid gap-2 border border-slate-200 p-3 md:grid-cols-[1fr_1fr_2fr_auto]"
                  key={index}
                >
                  <input
                    className={field}
                    disabled={!canEdit || busy}
                    placeholder="中文标签"
                    value={link.labelZh}
                    onChange={(event) =>
                      update(
                        "personalLinks",
                        draft.personalLinks.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, labelZh: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                  <input
                    className={field}
                    disabled={!canEdit || busy}
                    placeholder="English label"
                    value={link.labelEn}
                    onChange={(event) =>
                      update(
                        "personalLinks",
                        draft.personalLinks.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, labelEn: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                  <input
                    className={field}
                    disabled={!canEdit || busy}
                    placeholder="https://"
                    value={link.url}
                    onChange={(event) =>
                      update(
                        "personalLinks",
                        draft.personalLinks.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, url: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                  <button
                    className="text-xs font-semibold text-red-700 underline"
                    disabled={!canEdit || busy}
                    onClick={() =>
                      update(
                        "personalLinks",
                        draft.personalLinks.filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      )
                    }
                    type="button"
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
        <aside>
          <div className="sticky top-24">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs font-bold text-blue-950">
                官网成员卡片预览
              </p>
              <button
                type="button"
                className="min-h-11 px-3 text-xs text-blue-800"
                onClick={() =>
                  setPreviewLocale(previewLocale === "zh" ? "en" : "zh")
                }
              >
                {previewLocale === "zh" ? "English" : "中文"}
              </button>
            </div>
            <p className="mb-3 text-xs leading-6 text-slate-500">
              {draft.publicVisible
                ? "保存后按公开字段展示在官网"
                : "当前不公开，仅预览卡片样式"}
              。与官网使用同一卡片，头像裁剪、公开资料展开同步。
            </p>
            <MemberCard
              member={preview}
              locale={previewLocale}
              portrait={
                preview.image ? (
                  <div className="relative h-full w-full">
                    <Image
                      unoptimized
                      fill
                      alt="成员头像预览"
                      src={preview.image.src}
                      style={{
                        objectFit: "cover",
                        objectPosition: `${draft.avatarPositionX}% ${draft.avatarPositionY}%`,
                        transform: `scale(${draft.avatarZoom})`,
                        transformOrigin: `${draft.avatarPositionX}% ${draft.avatarPositionY}%`,
                      }}
                    />
                  </div>
                ) : (
                  <span className="grid h-full place-content-center">
                    <Image
                      alt=""
                      aria-hidden="true"
                      className="h-auto w-10 opacity-35"
                      height={35}
                      src={RNAV_BRAND_ASSETS.mark}
                      unoptimized
                      width={40}
                    />
                  </span>
                )
              }
            />
          </div>
        </aside>
      </div>
      {canEdit ? (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            className="bg-blue-950 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-400"
            disabled={busy || uploading}
            onClick={() => void save()}
            type="button"
          >
            {saveState === "saving" ? "保存中…" : "保存成员资料"}
          </button>
          {saveState === "saved" ? <span className="text-sm font-semibold text-emerald-700">✓ 已保存</span> : null}
          {saveState === "error" ? <span className="text-sm font-semibold text-red-700">保存失败：{saveError}</span> : null}
          {saveState === "conflict" ? <span className="text-sm font-semibold text-amber-800">{saveError} <button className="underline" onClick={() => void reload()} type="button">加载最新资料</button></span> : null}
          {draft.memberStatus === "current" && draft.baseTier !== "super" ? (
            <button
              className="border border-amber-400 px-4 py-2 text-sm font-bold text-amber-900"
              disabled={busy || uploading}
              onClick={() => {
                if (
                  window.confirm(
                    "确认转换为校友？系统将检查占用设备，清理岗位权限并撤销旧会话。",
                  )
                )
                  void onConvert();
              }}
              type="button"
            >
              转换为校友
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Range({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-xs text-slate-700">
      {label}
      <span className="ml-2 text-slate-500">{value}</span>
      <input
        className="mt-2 block w-full accent-cyan-700"
        min={min}
        max={max}
        step={step}
        type="range"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
function AvatarPreview({
  member,
}: {
  member: Pick<
    Member,
    "avatarUrl" | "avatarPositionX" | "avatarPositionY" | "avatarZoom"
  >;
}) {
  return (
    <div className="mt-3 aspect-[10/13] w-32 overflow-hidden bg-slate-100">
      <img
        alt="成员头像预览"
        className="h-full w-full object-cover"
        src={member.avatarUrl ?? ""}
        style={{
          objectPosition: `${member.avatarPositionX}% ${member.avatarPositionY}%`,
          transform: `scale(${member.avatarZoom})`,
          transformOrigin: `${member.avatarPositionX}% ${member.avatarPositionY}%`,
        }}
      />
    </div>
  );
}
