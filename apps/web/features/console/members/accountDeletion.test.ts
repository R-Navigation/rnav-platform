import assert from "node:assert/strict";
import test from "node:test";
import {
  accountLifecycleCopy,
  canConfirmPermanentDelete,
  canShowPermanentDelete,
  removeDeletedMember,
  type AccountDeletionCheck,
} from "./accountDeletion.ts";

const check: AccountDeletionCheck = {
  deletable: true,
  target: {
    id: "user-2",
    username: "test.user",
    displayName: "Test User",
    accountKind: "person",
    baseTier: "normal",
    status: "disabled",
    lastLoginAt: null,
  },
  dependencies: [],
};

test("permanent deletion is only visible to a super with users.write", () => {
  assert.equal(canShowPermanentDelete("super", true), true);
  assert.equal(canShowPermanentDelete("super", false), false);
  assert.equal(canShowPermanentDelete("plus", true), false);
  assert.equal(canShowPermanentDelete("normal", true), false);
});

test("confirmation requires an exact username and a deletable precheck", () => {
  assert.equal(canConfirmPermanentDelete(check, "test.user"), true);
  assert.equal(canConfirmPermanentDelete(check, "Test.User"), false);
  assert.equal(canConfirmPermanentDelete(check, " test.user "), false);
  assert.equal(
    canConfirmPermanentDelete({ ...check, deletable: false }, "test.user"),
    false,
  );
});

test("disabled and permanently deleted accounts have distinct guidance", () => {
  assert.match(accountLifecycleCopy.disable, /保留/);
  assert.match(accountLifecycleCopy.disable, /恢复/);
  assert.match(accountLifecycleCopy.permanentDelete, /无法恢复/);
  assert.notEqual(
    accountLifecycleCopy.disable,
    accountLifecycleCopy.permanentDelete,
  );
});

test("a successful deletion removes the member from local list state", () => {
  assert.deepEqual(
    removeDeletedMember([{ id: "user-1" }, { id: "user-2" }], "user-2"),
    [{ id: "user-1" }],
  );
});
