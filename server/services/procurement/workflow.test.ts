import assert from "node:assert/strict";
import test from "node:test";
import { requiredPermissionForTransition, validateTransition } from "./workflow.js";

test("procurement workflow enforces the review, purchase, and close stages", () => {
  assert.equal(validateTransition("submitted", "approve"), "approved");
  assert.equal(validateTransition("approved", "start_purchase"), "purchasing");
  assert.equal(validateTransition("purchasing", "mark_purchased"), "purchased");
  assert.equal(validateTransition("purchased", "mark_received"), "received");
  assert.equal(validateTransition("received", "close"), "closed");
  assert.throws(() => validateTransition("submitted", "close"), /not allowed/);
});

test("each privileged transition maps to one granular permission", () => {
  assert.equal(requiredPermissionForTransition("approve"), "procurements.review");
  assert.equal(requiredPermissionForTransition("start_purchase"), "procurements.purchase");
  assert.equal(requiredPermissionForTransition("close"), "procurements.close");
});
