import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("procurement proxy exports every catalog CRUD method", async () => {
  const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");
  for (const method of ["GET", "POST", "PUT", "DELETE"]) {
    assert.match(source, new RegExp(`export const ${method} = proxy`));
  }
});
