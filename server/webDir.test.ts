import assert from "node:assert/strict";
import test from "node:test";
import { resolveWebDir } from "./webDir.js";

test("resolveWebDir finds the Next.js app from source and compiled server paths", () => {
  const existing = new Set(["/srv/rnav_platform/apps/web/package.json"]);
  const exists = (path: string) => existing.has(path);

  assert.equal(
    resolveWebDir("file:///srv/rnav_platform/server/index.ts", exists),
    "/srv/rnav_platform/apps/web"
  );
  assert.equal(
    resolveWebDir("file:///srv/rnav_platform/server/dist/index.js", exists),
    "/srv/rnav_platform/apps/web"
  );
});
