import assert from "node:assert/strict";
import test from "node:test";
import { getTrappedFocusIndex } from "./dialog-keyboard.ts";

test("discard dialog wraps Tab focus in both directions", () => {
  assert.equal(getTrappedFocusIndex(1, 2, false), 0);
  assert.equal(getTrappedFocusIndex(0, 2, true), 1);
  assert.equal(getTrappedFocusIndex(0, 2, false), null);
});
