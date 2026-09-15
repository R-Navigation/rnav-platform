import assert from "node:assert/strict";
import test from "node:test";
import { createBulkPlan } from "./bulkPlanner.js";

test("bulk plan only marks non-duplicate pending works as safe to accept", () => {
  const plan = createBulkPlan(["safe", "duplicate", "accepted", "missing"], [
    { id: "safe", decision: "pending", sourceSnapshot: { normalized: { title: "A" } } },
    { id: "duplicate", decision: "pending", sourceSnapshot: { normalized: { title: "B" } }, duplicateSuggestion: { researchItemId: "paper-b", confidence: "high" } },
    { id: "accepted", decision: "accepted", sourceSnapshot: { normalized: { title: "C" } } },
  ]);
  assert.deepEqual(plan.counts, { safe_accept: 1, suggested_merge: 1, already_accepted: 1, needs_review: 0, conflict: 1 });
  assert.equal(plan.items[1].suggestedResearchItemId, "paper-b");
});

test("ignored and incomplete candidates remain manual-review items", () => {
  const plan = createBulkPlan(["ignored", "broken"], [
    { id: "ignored", decision: "ignored", sourceSnapshot: { normalized: {} } },
    { id: "broken", decision: "pending", sourceSnapshot: {} },
  ]);
  assert.equal(plan.items[0].action, "needs_review");
  assert.equal(plan.items[1].action, "conflict");
});
