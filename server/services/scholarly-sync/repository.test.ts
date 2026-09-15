import assert from "node:assert/strict";
import test from "node:test";
import { countAuthorOverlap, resolveScholarlyProfileUpdate, resolveStoredWorkMatch } from "./repository.js";

test("duplicate suggestion confidence accepts punctuation and case variants in author names", () => {
  assert.equal(countAuthorOverlap(["Zi-Xuan Huang", "You Li"], ["zi xuan huang", "Someone Else"]), 1);
});

test("title and year similarity alone does not invent an author overlap", () => {
  assert.equal(countAuthorOverlap(["Alice Zhang"], ["Bob Li"]), 0);
});

test("a DOI and OpenAlex ID resolving to different rows is an explicit conflict", () => {
  assert.throws(() => resolveStoredWorkMatch([{ id: "doi-row" }, { id: "openalex-row" }]), /身份冲突/);
  assert.deepEqual(resolveStoredWorkMatch([{ id: "shared-row" }]), { id: "shared-row" });
});

test("changing ORCID resets identity, automatic publication, and synchronization safely", () => {
  const current = { userId: "user-1", orcidId: "0000-0002-1825-0097", openalexAuthorId: "A1", identityStatus: "verified", syncEnabled: true, syncFromYear: 2020, syncToYear: 2026, newWorkPolicy: "auto", verifiedAt: null, lastSyncedAt: null, lastSyncStatus: null, lastSyncMessage: null } as const;
  const updated = resolveScholarlyProfileUpdate(current, { orcidId: "0000-0001-5109-3700" });
  assert.equal(updated.identityStatus, "pending");
  assert.equal(updated.openalexAuthorId, null);
  assert.equal(updated.syncEnabled, false);
  assert.equal(updated.newWorkPolicy, "review");
});
