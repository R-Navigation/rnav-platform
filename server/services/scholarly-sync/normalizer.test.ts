import assert from "node:assert/strict";
import test from "node:test";
import { mapPublicationType, normalizeDoi, normalizeOrcid, normalizeProviderId, normalizeWork, titleFingerprint } from "./normalizer.js";

const openAlexWork = {
  id: "https://openalex.org/W123", doi: "https://doi.org/10.1000/ABC", title: "OpenAlex title",
  publication_year: 2025, publication_date: "2025-02-03", type: "article", updated_date: "2026-01-01T00:00:00Z", cited_by_count: 7,
  primary_location: { landing_page_url: "https://publisher.example/work", source: { display_name: "OpenAlex Venue" } },
  ids: { arxiv: "https://arxiv.org/abs/2501.00001" },
  authorships: [{ author: { id: "https://openalex.org/A456", display_name: "Jane Doe", orcid: "https://orcid.org/0000-0002-1825-0097" }, raw_author_name: "J. Doe" }],
};

test("normalizes DOI, OpenAlex IDs, and valid ORCID without accepting malformed identities", () => {
  assert.equal(normalizeDoi(" DOI:10.1000/ABC "), "10.1000/abc");
  assert.equal(normalizeDoi("https://doi.org/10.1000%2FABC"), "10.1000/abc");
  assert.equal(normalizeDoi("not-a-doi"), null);
  assert.equal(normalizeProviderId("https://openalex.org/a123", "A"), "A123");
  assert.equal(normalizeOrcid("https://orcid.org/0000-0002-1825-0097"), "0000-0002-1825-0097");
  assert.equal(normalizeOrcid("0000-0002-1825-0098"), null);
});
test("Crossref enriches canonical display metadata while OpenAlex remains discovery identity", () => {
  const normalized = normalizeWork(openAlexWork, { DOI: "10.1000/ABC", title: ["Crossref title"], "container-title": ["Crossref Venue"], type: "proceedings-article", URL: "https://doi.org/10.1000/abc", published: { "date-parts": [[2026, 4, 5]] } });
  assert.equal(normalized.openalexWorkId, "W123");
  assert.equal(normalized.title, "Crossref title");
  assert.equal(normalized.venue, "Crossref Venue");
  assert.equal(normalized.year, 2026);
  assert.equal(normalized.authors[0].openalexAuthorId, "A456");
  assert.equal(normalized.citedByCount, 7);
});

test("type mapping only emits RNAV-supported semantic types and fingerprints punctuation consistently", () => {
  assert.equal(mapPublicationType("article"), "journal");
  assert.equal(mapPublicationType("proceedings-article"), "conference");
  assert.equal(mapPublicationType("dataset"), "");
  assert.equal(titleFingerprint("Visual-SLAM: A Study", 2025), titleFingerprint("visual slam a study", 2025));
});
