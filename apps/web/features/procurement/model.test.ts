import assert from "node:assert/strict";
import test from "node:test";
import { availableActions, procurementCapabilities } from "./model.ts";

test("normal members can create and only see requester actions", () => {
  const capability = procurementCapabilities(["procurements.create", "procurements.read_own"]);
  assert.equal(capability.create, true);
  assert.equal(capability.readAll, false);
  assert.deepEqual(availableActions("submitted", capability, true), [{ action: "cancel", label: "撤回申请" }]);
});

test("advanced procurement permissions expose only their workflow stage", () => {
  const reviewer = procurementCapabilities(["procurements.review"]);
  assert.deepEqual(availableActions("submitted", reviewer, false).map((item) => item.action), ["approve", "reject"]);
  const purchaser = procurementCapabilities(["procurements.purchase"]);
  assert.deepEqual(availableActions("approved", purchaser, false).map((item) => item.action), ["start_purchase"]);
});
