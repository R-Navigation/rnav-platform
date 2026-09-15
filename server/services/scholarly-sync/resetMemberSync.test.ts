import assert from "node:assert/strict";
import test from "node:test";
import { planMemberReset, type ResetWorkRow } from "./resetMemberSync.js";

const row = (input: Partial<ResetWorkRow>): ResetWorkRow => ({
  workId: input.workId ?? crypto.randomUUID(), sourceType: input.sourceType ?? "openalex", decision: input.decision ?? "pending",
  researchItemId: input.researchItemId ?? null, openalexWorkId: input.openalexWorkId ?? "W1", otherMemberCount: input.otherMemberCount ?? 0,
});

test("member reset removes orphan candidates and generated publications", () => {
  const plan = planMemberReset([
    row({ workId: "pending", decision: "pending" }), row({ workId: "ignored", decision: "ignored" }),
    row({ workId: "accepted", decision: "accepted", openalexWorkId: "W123", researchItemId: "openalex-w123" }),
  ], []);
  assert.equal(plan.pendingCandidates, 1); assert.equal(plan.ignoredCandidates, 1); assert.equal(plan.acceptedSyncCreated, 1);
  assert.deepEqual(plan.researchItemIdsToDelete, ["openalex-w123"]); assert.equal(plan.workIdsToDelete.length, 3); assert.equal(plan.blocked, false);
});

test("member reset preserves merged manual publications and shared works", () => {
  const plan = planMemberReset([
    row({ workId: "merged", decision: "accepted", openalexWorkId: "W1", researchItemId: "manual-paper" }),
    row({ workId: "shared", decision: "accepted", openalexWorkId: "W2", researchItemId: "openalex-w2", otherMemberCount: 1 }),
  ], []);
  assert.equal(plan.mergedManualPublications, 1); assert.equal(plan.sharedWorksPreserved, 1);
  assert.deepEqual(plan.researchItemIdsToDelete, []); assert.deepEqual(plan.workIdsToDelete, ["merged"]);
  assert.deepEqual(plan.removableRelationWorkIds, ["merged", "shared"]);
});

test("member reset hard-blocks manual registry rows and homepage featured generated papers", () => {
  const plan = planMemberReset([
    row({ workId: "manual", sourceType: "manual", decision: "accepted", researchItemId: "paper-1" }),
    row({ workId: "featured", decision: "accepted", openalexWorkId: "W9", researchItemId: "openalex-w9" }),
  ], ["openalex-w9"]);
  assert.equal(plan.manualWorksProtected, 1); assert.deepEqual(plan.featuredBlocks, ["openalex-w9"]); assert.equal(plan.blocked, true);
  assert.deepEqual(plan.removableRelationWorkIds, ["featured"]);
});
