import assert from "node:assert/strict";
import test from "node:test";
import { getMigrationFiles } from "./runMigrations.js";

test("getMigrationFiles returns SQL migrations in lexical order", async () => {
  const files = await getMigrationFiles(new URL("./migrations/", import.meta.url));
  assert.deepEqual(
    files.map((file) => file.name),
    ["001_core_auth.sql", "004_procurement.sql"]
  );
});
