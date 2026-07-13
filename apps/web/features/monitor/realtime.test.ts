import assert from "node:assert/strict";
import test from "node:test";
import { getLoadFailureState, shouldClearSnapshot, shouldConnectRealtime, shouldSyncMarkers } from "./realtime.ts";

test("quiet refresh failures keep an existing snapshot ready for later retries", () => {
  assert.equal(getLoadFailureState({ quiet: true, hasSnapshot: true }), "ready");
  assert.equal(getLoadFailureState({ quiet: false, hasSnapshot: true }), "error");
  assert.equal(getLoadFailureState({ quiet: true, hasSnapshot: false }), "error");
});

test("settings-only console users stay out of the internal realtime audience", () => {
  assert.equal(shouldConnectRealtime("console", ["monitor.settings.write"]), false);
  assert.equal(shouldConnectRealtime("console", ["monitor.devices.read"]), true);
  assert.equal(shouldConnectRealtime("public", []), true);
});

test("console authorization failures clear privileged snapshots", () => {
  assert.equal(shouldClearSnapshot("console", 401), true);
  assert.equal(shouldClearSnapshot("console", 403), true);
  assert.equal(shouldClearSnapshot("console", 502), false);
  assert.equal(shouldClearSnapshot("public", 401), false);
});

test("markers synchronize only after the map has finished initializing", () => {
  assert.equal(shouldSyncMarkers(false), false);
  assert.equal(shouldSyncMarkers(true), true);
});
