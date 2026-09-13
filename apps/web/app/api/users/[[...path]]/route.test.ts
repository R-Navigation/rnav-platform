import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("user proxy exports the permanent deletion method", async () => {
  const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(source, /export const DELETE = proxy/);
});
