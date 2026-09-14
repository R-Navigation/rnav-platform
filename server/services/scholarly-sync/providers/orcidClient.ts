import { normalizeOrcid } from "../normalizer.js";

// Scholarly Sync 1.0 uses ORCID as a locally validated identity anchor.
// Registry/OAuth integration intentionally remains out of scope.
export function validateOrcidIdentity(value: string) {
  return normalizeOrcid(value);
}
