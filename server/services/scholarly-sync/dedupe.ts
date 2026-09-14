import { titleFingerprint } from "./normalizer.js";
import type { NormalizedScholarlyWork } from "./types.js";

export type WorkIdentity = { id: string; openalexWorkId: string | null; doi: string | null; title: string; year: number | null };

export function findDuplicate(work: NormalizedScholarlyWork, existing: WorkIdentity[]) {
  if (work.doi) {
    const exactDoi = existing.find((item) => item.doi === work.doi);
    if (exactDoi) return { level: "doi" as const, item: exactDoi };
  }
  const exactOpenAlex = existing.find((item) => item.openalexWorkId === work.openalexWorkId);
  if (exactOpenAlex) return { level: "openalex" as const, item: exactOpenAlex };
  const fingerprint = titleFingerprint(work.title, work.year);
  const possible = existing.find((item) => titleFingerprint(item.title, item.year) === fingerprint);
  return possible ? { level: "possible" as const, item: possible } : null;
}
