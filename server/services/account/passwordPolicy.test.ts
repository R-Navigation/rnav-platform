import assert from "node:assert/strict";
import test from "node:test";
import { validatePasswordPolicy } from "./passwordPolicy.js";

test("password policy only requires at least eight characters", () => {
  assert.deepEqual(validatePasswordPolicy("1234567"), { success: false, issues: ["至少 8 个字符"] });
  assert.deepEqual(validatePasswordPolicy("abcdefgh"), { success: true });
  assert.deepEqual(validatePasswordPolicy("纯中文密码"), { success: false, issues: ["至少 8 个字符"] });
  assert.deepEqual(validatePasswordPolicy("纯中文密码也可以"), { success: true });
});
