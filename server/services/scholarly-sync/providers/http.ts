export type ProviderFetch = typeof fetch;

export class ProviderHttpError extends Error {
  constructor(readonly provider: string, readonly status: number, message: string) {
    super(message);
    this.name = "ProviderHttpError";
  }
}

export async function fetchProviderJson(
  provider: string,
  url: URL,
  options: { fetchImpl?: ProviderFetch; headers?: Record<string, string> | Headers; retries?: number; timeoutMs?: number } = {},
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const retries = options.retries ?? 2;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 12_000);
    try {
      const response = await fetchImpl(url, { headers: options.headers, signal: controller.signal });
      if (response.ok) return await response.json() as unknown;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === retries) throw new ProviderHttpError(provider, response.status, `${provider} request failed (${response.status})`);
      const retryAfter = Number(response.headers.get("retry-after"));
      await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfter) ? Math.min(retryAfter * 1_000, 10_000) : 250 * 2 ** attempt));
    } catch (error) {
      lastError = error;
      if (error instanceof ProviderHttpError || attempt === retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}
