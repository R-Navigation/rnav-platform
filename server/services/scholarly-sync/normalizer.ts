import { createHash } from "node:crypto";
import type { z } from "zod";
import type { crossrefWorkSchema, openAlexWorkSchema } from "./schemas.js";
import type { NormalizedScholarlyWork } from "./types.js";

type OpenAlexWork = z.output<typeof openAlexWorkSchema>;
type CrossrefWork = z.output<typeof crossrefWorkSchema>;

export function normalizeProviderId(value: string | null | undefined, prefix: "A" | "W") {
  if (!value) return null;
  const normalized = value.trim().replace(/^https?:\/\/openalex\.org\//i, "").toUpperCase();
  return new RegExp(`^${prefix}\\d+$`).test(normalized) ? normalized : null;
}

export function normalizeDoi(value: string | null | undefined) {
  if (!value) return null;
  let decoded: string;
  try { decoded = decodeURIComponent(value.trim()); } catch { return null; }
  const normalized = decoded
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "").trim().toLowerCase();
  return /^10\.\d{4,9}\/\S+$/.test(normalized) ? normalized : null;
}

export function normalizeOrcid(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.trim().replace(/^https?:\/\/orcid\.org\//i, "").toUpperCase();
  if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(normalized)) return null;
  const digits = normalized.replaceAll("-", "");
  let total = 0;
  for (const digit of digits.slice(0, 15)) total = (total + Number(digit)) * 2;
  const remainder = (12 - (total % 11)) % 11;
  return (remainder === 10 ? "X" : String(remainder)) === digits[15] ? normalized : null;
}

function safeHttps(value: unknown) {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : null; } catch { return null; }
}

function crossrefDate(work?: CrossrefWork | null) {
  const parts = work?.published?.["date-parts"]?.[0]
    ?? work?.["published-online"]?.["date-parts"]?.[0]
    ?? work?.["published-print"]?.["date-parts"]?.[0];
  if (!parts?.[0]) return null;
  return `${parts[0]}-${String(parts[1] ?? 1).padStart(2, "0")}-${String(parts[2] ?? 1).padStart(2, "0")}`;
}

export function normalizeWork(openAlex: OpenAlexWork, crossref?: CrossrefWork | null): NormalizedScholarlyWork {
  const openalexWorkId = normalizeProviderId(openAlex.id, "W");
  if (!openalexWorkId) throw new Error("OpenAlex work has an invalid id");
  const doi = normalizeDoi(crossref?.DOI ?? openAlex.doi);
  const publicationDate = crossrefDate(crossref) ?? openAlex.publication_date ?? null;
  const year = publicationDate ? Number(publicationDate.slice(0, 4)) : openAlex.publication_year ?? null;
  const ids = openAlex.ids ?? {};
  const arxiv = safeHttps(ids.arxiv);
  return {
    openalexWorkId,
    doi,
    title: crossref?.title?.[0]?.trim() || openAlex.title.trim(),
    year: Number.isInteger(year) ? year : null,
    publicationDate,
    venue: crossref?.["container-title"]?.[0]?.trim() || openAlex.primary_location?.source?.display_name?.trim() || "",
    providerType: crossref?.type?.trim() || openAlex.type.trim(),
    authors: openAlex.authorships.map((entry, index) => ({
      openalexAuthorId: normalizeProviderId(entry.author.id, "A"),
      orcid: normalizeOrcid(entry.author.orcid),
      displayName: entry.author.display_name.trim(),
      rawName: entry.raw_author_name?.trim() || entry.author.display_name.trim(),
      position: index,
    })),
    doiUrl: doi ? `https://doi.org/${doi}` : null,
    landingPageUrl: safeHttps(crossref?.URL) ?? safeHttps(openAlex.primary_location?.landing_page_url),
    arxivUrl: arxiv,
    providerUpdatedAt: openAlex.updated_date ?? null,
    citedByCount: openAlex.cited_by_count ?? null,
  };
}

export function providerHash(work: NormalizedScholarlyWork) {
  return createHash("sha256").update(JSON.stringify(work)).digest("hex");
}

export function titleFingerprint(title: string, year: number | null) {
  const normalized = title.normalize("NFKD").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
  return `${year ?? ""}:${normalized}`;
}

export function mapPublicationType(providerType: string) {
  const normalized = providerType.toLowerCase();
  if (["article", "journal-article"].includes(normalized)) return "journal";
  if (["proceedings-article", "conference-paper"].includes(normalized)) return "conference";
  return "";
}
