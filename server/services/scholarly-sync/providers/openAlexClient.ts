import { z } from "zod";
import { normalizeOrcid, normalizeProviderId } from "../normalizer.js";
import { openAlexAuthorSchema, openAlexWorkSchema } from "../schemas.js";
import type { OpenAlexAuthorCandidate } from "../types.js";
import { fetchProviderJson, type ProviderFetch, type ProviderObservation } from "./http.js";

type DynamicValue = string | undefined | (() => string | undefined | Promise<string | undefined>);
type Options = { baseUrl?: string; apiKey?: DynamicValue; fetchImpl?: ProviderFetch; onObservation?: (observation: ProviderObservation) => void };
const authorListSchema = z.object({ results: z.array(openAlexAuthorSchema) }).passthrough();
const workListSchema = z.object({ results: z.array(openAlexWorkSchema), meta: z.object({ next_cursor: z.string().nullable().optional() }).passthrough() }).passthrough();
const authorSelect = "id,display_name,orcid,works_count,last_known_institutions,affiliations";
const workSelect = "id,doi,title,publication_year,publication_date,type,authorships,primary_location,ids,open_access,updated_date,cited_by_count";

export function createOpenAlexClient(options: Options = {}) {
  const baseUrl = new URL(options.baseUrl ?? "https://api.openalex.org");
  const apiKey = async () => typeof options.apiKey === "function" ? options.apiKey() : options.apiKey;
  const request = async (path: string, params: Record<string, string | undefined> = {}) => {
    const url = new URL(path, baseUrl);
    for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value);
    const key = await apiKey();
    if (key) url.searchParams.set("api_key", key);
    return fetchProviderJson("OpenAlex", url, { fetchImpl: options.fetchImpl, onObservation: options.onObservation });
  };

  const getWorksByAuthor = async (authorId: string, fromYear?: number | null, toYear?: number | null, limit?: number) => {
    const normalized = normalizeProviderId(authorId, "A");
    if (!normalized) throw new Error("Invalid OpenAlex author id");
    const filters = [`author.id:${normalized}`];
    if (fromYear) filters.push(`from_publication_date:${fromYear}-01-01`);
    if (toYear) filters.push(`to_publication_date:${toYear}-12-31`);
    const works: z.output<typeof openAlexWorkSchema>[] = [];
    let cursor = "*";
    do {
      const parsed = workListSchema.parse(await request("/works", { filter: filters.join(","), select: workSelect, per_page: "100", cursor }));
      works.push(...parsed.results);
      cursor = parsed.meta.next_cursor ?? "";
      if (limit && works.length >= limit) break;
    } while (cursor);
    return limit ? works.slice(0, limit) : works;
  };

  const toCandidate = async (author: z.output<typeof openAlexAuthorSchema>): Promise<OpenAlexAuthorCandidate> => {
    const id = normalizeProviderId(author.id, "A");
    if (!id) throw new Error("OpenAlex author has an invalid id");
    const institution = author.last_known_institutions?.[0]?.display_name
      ?? author.affiliations?.[0]?.institution?.display_name ?? "";
    const recent = await getWorksByAuthor(id, null, null, 3);
    return {
      id, displayName: author.display_name, orcid: normalizeOrcid(author.orcid), institution,
      worksCount: author.works_count,
      recentWorks: recent.map((work) => ({ id: normalizeProviderId(work.id, "W") ?? "", title: work.title, year: work.publication_year ?? null })),
    };
  };

  return {
    async resolveAuthorByOrcid(orcid: string) {
      const normalized = normalizeOrcid(orcid);
      if (!normalized) throw new Error("Invalid ORCID");
      const author = openAlexAuthorSchema.parse(await request(`/authors/orcid:${normalized}`, { select: authorSelect }));
      return toCandidate(author);
    },
    async searchAuthorCandidates(name: string, institution?: string) {
      const search = [name.trim(), institution?.trim()].filter(Boolean).join(" ");
      const parsed = authorListSchema.parse(await request("/authors", { search, select: authorSelect, per_page: "5" }));
      return Promise.all(parsed.results.map(toCandidate));
    },
    async getAuthor(authorId: string) {
      const normalized = normalizeProviderId(authorId, "A");
      if (!normalized) throw new Error("Invalid OpenAlex author id");
      return toCandidate(openAlexAuthorSchema.parse(await request(`/authors/${normalized}`, { select: authorSelect })));
    },
    getWorksByAuthor,
    async getWorkByDoi(doi: string) {
      const result = await request(`/works/https://doi.org/${encodeURIComponent(doi)}`, { select: workSelect });
      return openAlexWorkSchema.parse(result);
    },
    async getWork(workId: string) {
      const normalized = normalizeProviderId(workId, "W");
      if (!normalized) throw new Error("Invalid OpenAlex work id");
      return openAlexWorkSchema.parse(await request(`/works/${normalized}`, { select: workSelect }));
    },
    async searchWorks(title: string) {
      const parsed = workListSchema.parse(await request("/works", { search: title.trim(), select: workSelect, per_page: "5", cursor: "*" }));
      return parsed.results;
    },
    async checkRateLimit() {
      const url = new URL("/rate-limit", baseUrl);
      const key = await apiKey();
      if (key) url.searchParams.set("api_key", key);
      return fetchProviderJson("OpenAlex", url, { fetchImpl: options.fetchImpl, retries: 0, onObservation: options.onObservation });
    },
  };
}

export type OpenAlexClient = ReturnType<typeof createOpenAlexClient>;
