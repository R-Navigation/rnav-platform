import assert from "node:assert/strict";
import test from "node:test";
import { validatePasswordPolicy } from "./passwordPolicy.js";

test("password policy requires length, upper, lower, digit, and special characters", () => {
  const invalid = validatePasswordPolicy("short");
  assert.equal(invalid.success, false);
  if (!invalid.success) assert.equal(invalid.issues.length, 4);
  assert.deepEqual(validatePasswordPolicy("LongEnough1!"), { success: true });
});
