export type ProviderFetch = typeof fetch;

export type ProviderHealth = "healthy" | "key_missing" | "auth_error" | "budget_exhausted" | "rate_limited" | "timeout" | "provider_error" | "unknown";
export type ProviderRateLimit = { limit: number | null; remaining: number | null; creditsUsed: number | null; resetSeconds: number | null; resetAt: string | null };
export type ProviderObservation = { health: ProviderHealth; checkedAt: string; httpStatus: number | null; rateLimit: ProviderRateLimit; message: string };

const headerNumber = (headers: Headers, name: string) => {
  const value = headers.get(name); if (value == null || value === "") return null;
  const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null;
};

export function parseProviderRateLimit(headers: Headers, now = new Date()): ProviderRateLimit {
  const resetSeconds = headerNumber(headers, "x-ratelimit-reset");
  return {
    limit: headerNumber(headers, "x-ratelimit-limit"), remaining: headerNumber(headers, "x-ratelimit-remaining"),
    creditsUsed: headerNumber(headers, "x-ratelimit-credits-used"), resetSeconds,
    resetAt: resetSeconds == null ? null : new Date(now.getTime() + Math.max(0, resetSeconds) * 1_000).toISOString(),
  };
}

const emptyRateLimit = (): ProviderRateLimit => ({ limit: null, remaining: null, creditsUsed: null, resetSeconds: null, resetAt: null });
const errorCode = (provider: string, health: ProviderHealth) => `${provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_${health.toUpperCase()}`;

export class ProviderHttpError extends Error {
  constructor(readonly provider: string, readonly status: number, message: string, readonly code = errorCode(provider, "provider_error"), readonly rateLimit: ProviderRateLimit = emptyRateLimit(), readonly retryAt: string | null = rateLimit.resetAt) {
    super(message);
    this.name = "ProviderHttpError";
  }
}

export async function fetchProviderJson(
  provider: string,
  url: URL,
  options: { fetchImpl?: ProviderFetch; headers?: Record<string, string> | Headers; retries?: number; timeoutMs?: number; onObservation?: (observation: ProviderObservation) => void } = {},
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const retries = options.retries ?? 2;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 12_000);
    try {
      const response = await fetchImpl(url, { headers: options.headers, signal: controller.signal });
      const checkedAt = new Date(); const rateLimit = parseProviderRateLimit(response.headers, checkedAt);
      if (response.ok) {
        try {
          const body = await response.json() as unknown;
          options.onObservation?.({ health: "healthy", checkedAt: checkedAt.toISOString(), httpStatus: response.status, rateLimit, message: `${provider} 连接正常` });
          return body;
        } catch {
          const error = new ProviderHttpError(provider, response.status, `${provider} returned invalid JSON`, errorCode(provider, "provider_error"), rateLimit);
          options.onObservation?.({ health: "provider_error", checkedAt: checkedAt.toISOString(), httpStatus: response.status, rateLimit, message: `${provider} 返回了无效响应` });
          throw error;
        }
      }
      const retryable = response.status === 429 || response.status >= 500;
      const health: ProviderHealth = response.status === 401 || response.status === 403 ? "auth_error" : response.status === 429 ? (rateLimit.remaining === 0 ? "budget_exhausted" : "rate_limited") : response.status >= 500 ? "provider_error" : "unknown";
      const messages: Record<ProviderHealth, string> = { healthy: `${provider} 连接正常`, key_missing: `${provider} API Key 未配置`, auth_error: `${provider} API Key 被拒绝`, budget_exhausted: `${provider} 今日额度已用尽`, rate_limited: `${provider} 请求频率受限`, timeout: `${provider} 请求超时`, provider_error: `${provider} 服务暂时异常`, unknown: `${provider} 请求失败` };
      if (!retryable || attempt === retries) {
        options.onObservation?.({ health, checkedAt: checkedAt.toISOString(), httpStatus: response.status, rateLimit, message: messages[health] });
        throw new ProviderHttpError(provider, response.status, messages[health], errorCode(provider, health), rateLimit);
      }
      const retryAfter = Number(response.headers.get("retry-after"));
      await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfter) ? Math.min(retryAfter * 1_000, 10_000) : 250 * 2 ** attempt));
    } catch (error) {
      lastError = error;
      if (error instanceof ProviderHttpError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        if (attempt === retries) {
          const checkedAt = new Date().toISOString(); const rateLimit = emptyRateLimit();
          options.onObservation?.({ health: "timeout", checkedAt, httpStatus: null, rateLimit, message: `${provider} 请求超时` });
          throw new ProviderHttpError(provider, 0, `${provider} 请求超时`, errorCode(provider, "timeout"), rateLimit, null);
        }
      } else if (attempt === retries) {
        const checkedAt = new Date().toISOString(); const rateLimit = emptyRateLimit();
        options.onObservation?.({ health: "unknown", checkedAt, httpStatus: null, rateLimit, message: `${provider} 网络连接失败` });
        throw new ProviderHttpError(provider, 0, `${provider} 网络连接失败`, errorCode(provider, "unknown"), rateLimit, null);
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}
