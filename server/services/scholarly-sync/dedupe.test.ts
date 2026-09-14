import assert from "node:assert/strict";
import test from "node:test";
import { findDuplicate } from "./dedupe.js";
import type { NormalizedScholarlyWork } from "./types.js";

const work: NormalizedScholarlyWork = { openalexWorkId: "W1", doi: "10.1000/a", title: "A Robust SLAM System", year: 2025, publicationDate: null, venue: "", providerType: "article", authors: [], doiUrl: null, landingPageUrl: null, arxivUrl: null, providerUpdatedAt: null, citedByCount: null };

test("dedupe prioritizes exact DOI over OpenAlex ID and title warnings", () => {
  const result = findDuplicate(work, [
    { id: "doi", doi: "10.1000/a", openalexWorkId: null, title: "Other", year: 2025 },
    { id: "openalex", doi: null, openalexWorkId: "W1", title: "Other", year: 2025 },
  ]);
  assert.equal(result?.level, "doi"); assert.equal(result?.item.id, "doi");
});
test("title fingerprint is warning-only and year-sensitive", () => {
  assert.equal(findDuplicate({ ...work, doi: null, openalexWorkId: "W9" }, [{ id: "possible", doi: null, openalexWorkId: null, title: "a robust slam system", year: 2025 }])?.level, "possible");
  assert.equal(findDuplicate({ ...work, doi: null, openalexWorkId: "W9" }, [{ id: "other-year", doi: null, openalexWorkId: null, title: work.title, year: 2024 }]), null);
});
