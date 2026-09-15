import type { OpenAlexClient } from "./openAlexClient.js";
import type { ProviderHealth, ProviderObservation, ProviderRateLimit } from "./http.js";

export type OpenAlexStatus = {
  configured: boolean; health: ProviderHealth; checkedAt: string | null; lastSuccessAt: string | null;
  httpStatus: number | null; rateLimit: ProviderRateLimit; message: string;
};

const emptyRateLimit = (): ProviderRateLimit => ({ limit: null, remaining: null, creditsUsed: null, resetSeconds: null, resetAt: null });

export function createOpenAlexStatusMonitor(configured: boolean, ttlMs = 60_000) {
  let status: OpenAlexStatus = { configured, health: configured ? "unknown" : "key_missing", checkedAt: null, lastSuccessAt: null, httpStatus: null, rateLimit: emptyRateLimit(), message: configured ? "尚未检测 OpenAlex 状态" : "OpenAlex API Key 未配置" };
  const observe = (observation: ProviderObservation) => {
    status = { ...status, ...observation, configured, lastSuccessAt: observation.health === "healthy" ? observation.checkedAt : status.lastSuccessAt };
  };
  return {
    observe,
    getStatus: () => status,
    async check(client: Pick<OpenAlexClient, "checkRateLimit">, force = false) {
      if (!configured) return status;
      const fresh = status.checkedAt && Date.now() - new Date(status.checkedAt).getTime() < ttlMs;
      if (fresh && !force) return status;
      try { await client.checkRateLimit(); } catch { /* observation carries a safe classified result */ }
      return status;
    },
  };
}

export type OpenAlexStatusMonitor = ReturnType<typeof createOpenAlexStatusMonitor>;
