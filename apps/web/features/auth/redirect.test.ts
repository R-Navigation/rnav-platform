import assert from "node:assert/strict";
import test from "node:test";
import { normalizePostLoginPath } from "./redirect.ts";

test("accepts safe internal application paths", () => {
  const safePaths = [
    "/console",
    "/console/profile",
    "/console/profile/security?tab=sessions#current",
    "/research?topic=visual%20navigation#results",
  ];

  for (const path of safePaths) {
    assert.equal(normalizePostLoginPath(path), path);
  }
});

test("rejects network-path and backslash redirects", () => {
  const unsafePaths = [
    "//evil.example",
    "/\\evil.example",
    "/console\\settings",
    "/%5cevil.example",
    "/%255cevil.example",
  ];

  for (const path of unsafePaths) {
    assert.equal(normalizePostLoginPath(path), "/console");
  }
});

test("rejects control characters and encoded dangerous forms", () => {
  const unsafePaths = [
    "/console\n/profile",
    "/console\u0000/profile",
    "/console%0a/profile",
    "/console%250a/profile",
    "/%2f%2fevil.example",
    "/%252f%252fevil.example",
  ];

  for (const path of unsafePaths) {
    assert.equal(normalizePostLoginPath(path), "/console");
  }
});

test("rejects absolute URLs and non-path values", () => {
  const unsafePaths = [
    "https://evil.example",
    "http://evil.example/console",
    "javascript:alert(1)",
    "console/profile",
    "",
  ];

  for (const path of unsafePaths) {
    assert.equal(normalizePostLoginPath(path), "/console");
  }
});

test("defaults missing and ambiguous values to the console", () => {
  assert.equal(normalizePostLoginPath(undefined), "/console");
  assert.equal(normalizePostLoginPath([]), "/console");
  assert.equal(normalizePostLoginPath(["/console/profile", "//evil.example"]), "/console");
});
