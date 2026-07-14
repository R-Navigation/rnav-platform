export class ConsoleApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); this.name = "ConsoleApiError"; }
}
export async function consoleApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers } });
  if (response.status === 204) return undefined as T;
  let payload: unknown = {}; try { payload = await response.json(); } catch {}
  const errorPayload = payload && typeof payload === "object"
    ? payload as { error?: unknown; code?: unknown }
    : {};
  if (!response.ok) throw new ConsoleApiError(
    typeof errorPayload.error === "string" ? errorPayload.error : `请求失败（${response.status}）`,
    response.status,
    typeof errorPayload.code === "string" ? errorPayload.code : undefined,
  );
  return payload as T;
}
