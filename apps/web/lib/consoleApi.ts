export class ConsoleApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ConsoleApiError";
    this.status = status;
    this.code = code;
  }
}
export async function consoleApi<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const response = await fetch(path, {
    ...init,
    headers: { ...(init?.body && !isFormData ? { "content-type": "application/json" } : {}), ...init?.headers },
  });
  if (response.status === 204) return undefined as T;
  let payload: unknown = {}; try { payload = await response.json(); } catch {}
  const errorPayload = payload && typeof payload === "object"
    ? payload as { error?: unknown; code?: unknown; issues?: unknown }
    : {};
  const issueLabels: Record<string, string> = {
    personalLinks: "个人链接",
    graduationYear: "毕业年份",
    enrollmentYear: "入组年份",
    publicFields: "公开字段",
    publicVisible: "官网展示",
    academicStage: "学术身份",
    email: "邮箱",
  };
  const issueText = Array.isArray(errorPayload.issues)
    ? errorPayload.issues.map((issue) => {
      if (typeof issue === "string") return issue;
      if (!issue || typeof issue !== "object" || !("message" in issue)) return "";
      const structured = issue as { message: unknown; path?: unknown };
      const firstPath = Array.isArray(structured.path) ? String(structured.path[0] ?? "") : "";
      const label = issueLabels[firstPath];
      return `${label ? `${label}：` : ""}${String(structured.message)}`;
    }).filter(Boolean).join("；")
    : "";
  if (!response.ok) throw new ConsoleApiError(
    issueText || (typeof errorPayload.error === "string" ? errorPayload.error : `请求失败（${response.status}）`),
    response.status,
    typeof errorPayload.code === "string" ? errorPayload.code : undefined,
  );
  return payload as T;
}
