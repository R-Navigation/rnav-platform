import { crossrefWorkSchema } from "../schemas.js";
import { normalizeDoi } from "../normalizer.js";
import { fetchProviderJson, type ProviderFetch } from "./http.js";

type DynamicValue = string | undefined | (() => string | undefined | Promise<string | undefined>);
type Options = { baseUrl?: string; contactEmail?: DynamicValue; fetchImpl?: ProviderFetch };

export function createCrossrefClient(options: Options = {}) {
  const baseUrl = new URL(options.baseUrl ?? "https://api.crossref.org");
  const contactEmail = async () => typeof options.contactEmail === "function" ? options.contactEmail() : options.contactEmail;
  return {
    async getWorkByDoi(doi: string) {
      const normalized = normalizeDoi(doi);
      if (!normalized) throw new Error("Invalid DOI");
      const url = new URL(`/works/${encodeURIComponent(normalized)}`, baseUrl);
      const email = await contactEmail();
      if (email) url.searchParams.set("mailto", email);
      const body = await fetchProviderJson("Crossref", url, {
        fetchImpl: options.fetchImpl,
        retries: 2,
        headers: { "User-Agent": `RNAV-Scholarly-Sync/1.0${email ? ` (mailto:${email})` : ""}` },
      });
      const envelope = body && typeof body === "object" ? body as { message?: unknown } : {};
      return crossrefWorkSchema.parse(envelope.message);
    },
  };
}

export type CrossrefClient = ReturnType<typeof createCrossrefClient>;
