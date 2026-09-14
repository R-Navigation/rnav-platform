import { crossrefWorkSchema } from "../schemas.js";
import { normalizeDoi } from "../normalizer.js";
import { fetchProviderJson, type ProviderFetch } from "./http.js";

type Options = { baseUrl?: string; contactEmail?: string; fetchImpl?: ProviderFetch };

export function createCrossrefClient(options: Options = {}) {
  const baseUrl = new URL(options.baseUrl ?? "https://api.crossref.org");
  return {
    async getWorkByDoi(doi: string) {
      const normalized = normalizeDoi(doi);
      if (!normalized) throw new Error("Invalid DOI");
      const url = new URL(`/works/${encodeURIComponent(normalized)}`, baseUrl);
      if (options.contactEmail) url.searchParams.set("mailto", options.contactEmail);
      const body = await fetchProviderJson("Crossref", url, {
        fetchImpl: options.fetchImpl,
        retries: 2,
        headers: { "User-Agent": `RNAV-Scholarly-Sync/1.0${options.contactEmail ? ` (mailto:${options.contactEmail})` : ""}` },
      });
      const envelope = body && typeof body === "object" ? body as { message?: unknown } : {};
      return crossrefWorkSchema.parse(envelope.message);
    },
  };
}

export type CrossrefClient = ReturnType<typeof createCrossrefClient>;
