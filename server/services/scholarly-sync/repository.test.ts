import assert from "node:assert/strict";
import test from "node:test";
import { countAuthorOverlap, resolveStoredWorkMatch } from "./repository.js";

test("duplicate suggestion confidence accepts punctuation and case variants in author names", () => {
  assert.equal(countAuthorOverlap(["Zi-Xuan Huang", "You Li"], ["zi xuan huang", "Someone Else"]), 1);
});

test("title and year similarity alone does not invent an author overlap", () => {
  assert.equal(countAuthorOverlap(["Alice Zhang"], ["Bob Li"]), 0);
});

test("a DOI and OpenAlex ID resolving to different rows is an explicit conflict", () => {
  assert.throws(() => resolveStoredWorkMatch([{ id: "doi-row" }, { id: "openalex-row" }]), /身份冲突/);
  assert.deepEqual(resolveStoredWorkMatch([{ id: "shared-row" }]), { id: "shared-row" });
});
