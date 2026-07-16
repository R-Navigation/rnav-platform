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
  const response = await fetch(path, { ...init, headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers } });
  if (response.status === 204) return undefined as T;
  let payload: unknown = {}; try { payload = await response.json(); } catch {}
  const errorPayload = payload && typeof payload === "object"
    ? payload as { error?: unknown; code?: unknown; issues?: unknown }
    : {};
  const issueText = Array.isArray(errorPayload.issues)
    ? errorPayload.issues.map((issue) => typeof issue === "string" ? issue : issue && typeof issue === "object" && "message" in issue ? String(issue.message) : "").filter(Boolean).join("；")
    : "";
  if (!response.ok) throw new ConsoleApiError(
    issueText || (typeof errorPayload.error === "string" ? errorPayload.error : `请求失败（${response.status}）`),
    response.status,
    typeof errorPayload.code === "string" ? errorPayload.code : undefined,
  );
  return payload as T;
}
