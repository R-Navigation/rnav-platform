import assert from "node:assert/strict";
import test from "node:test";
import { getLoadFailureState, shouldSyncMarkers } from "./realtime.ts";

test("quiet refresh failures keep an existing snapshot ready for later retries", () => {
  assert.equal(getLoadFailureState({ quiet: true, hasSnapshot: true }), "ready");
  assert.equal(getLoadFailureState({ quiet: false, hasSnapshot: true }), "error");
  assert.equal(getLoadFailureState({ quiet: true, hasSnapshot: false }), "error");
});

test("markers synchronize only after the map has finished initializing", () => {
  assert.equal(shouldSyncMarkers(false), false);
  assert.equal(shouldSyncMarkers(true), true);
});
