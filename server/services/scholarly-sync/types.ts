export type ScholarlyIdentityStatus = "unconfigured" | "pending" | "verified" | "conflict";
export type ScholarlyDecision = "pending" | "accepted" | "ignored";
export type NewWorkPolicy = "review" | "auto";

export type NormalizedScholarlyAuthor = {
  openalexAuthorId: string | null;
  orcid: string | null;
  displayName: string;
  rawName: string;
  position: number;
};

export type NormalizedScholarlyWork = {
  openalexWorkId: string;
  doi: string | null;
  title: string;
  year: number | null;
  publicationDate: string | null;
  venue: string;
  providerType: string;
  authors: NormalizedScholarlyAuthor[];
  doiUrl: string | null;
  landingPageUrl: string | null;
  arxivUrl: string | null;
  providerUpdatedAt: string | null;
  citedByCount: number | null;
};

export type OpenAlexAuthorCandidate = {
  id: string;
  displayName: string;
  orcid: string | null;
  institution: string;
  worksCount: number;
  recentWorks: Array<{ id: string; title: string; year: number | null }>;
};

export type ScholarlyProfile = {
  userId: string;
  orcidId: string | null;
  openalexAuthorId: string | null;
  identityStatus: ScholarlyIdentityStatus;
  syncEnabled: boolean;
  syncFromYear: number | null;
  syncToYear: number | null;
  newWorkPolicy: NewWorkPolicy;
  verifiedAt: string | null;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastSyncMessage: string | null;
};

export const managedFieldKeys = [
  "title_en", "year", "venue_en", "type", "doi_link", "external_links",
] as const;
export type ManagedField = typeof managedFieldKeys[number];
