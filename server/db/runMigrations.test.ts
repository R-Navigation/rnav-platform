import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import {
  getMigrationFiles,
  runMigrations,
  type MigrationErrorWithCleanupFailures,
  type MigrationClient,
  type MigrationQueryResult
} from "./runMigrations.js";

const migrationName = "001_test.sql";
const migrationSql = "SELECT 'migration-body'";
const migrationChecksum = createHash("sha256").update(migrationSql).digest("hex");

type QueryCall = {
  sql: string;
  values?: readonly unknown[];
};

class RecordingClient implements MigrationClient {
  readonly calls: QueryCall[] = [];
  connectCount = 0;
  endCount = 0;
  endError?: Error;

  constructor(
    private readonly respond: (call: QueryCall) => MigrationQueryResult = () => ({
      rowCount: 0,
      rows: []
    })
  ) {}

  async connect() {
    this.connectCount += 1;
  }

  async query(sql: string, values?: readonly unknown[]) {
    const call = { sql, values };
    this.calls.push(call);
    return this.respond(call);
  }

  async end() {
    this.endCount += 1;
    if (this.endError) {
      throw this.endError;
    }
  }
}

async function withMigrationDirectory<Result>(
  callback: (directoryUrl: URL) => Promise<Result>
) {
  const directory = await mkdtemp(join(tmpdir(), "rnav-migrations-"));
  try {
    await writeFile(join(directory, migrationName), migrationSql);
    return await callback(pathToFileURL(`${directory}/`));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function isAppliedMigrationQuery(sql: string) {
  return sql.includes("WHERE version = $1");
}

test("getMigrationFiles returns SQL migrations in lexical order", async () => {
  const files = await getMigrationFiles(new URL("./migrations/", import.meta.url));
  assert.deepEqual(
    files.map((file) => file.name),
    [
      "001_core_auth.sql",
      "004_procurement.sql",
      "005_procurement_constraints.sql",
      "006_public_site_legacy.sql",
      "007_public_site_compatibility.sql",
      "008_site_admin_revisions.sql",
      "009_site_admin_roundtrip.sql",
      "010_site_admin_link_variants.sql",
      "010a_lab_assets_legacy_compat.sql",
      "011_lab_assets_admin.sql"
    ]
  );
});

test("lab assets compatibility migration fills safe legacy columns before indexes are created", async () => {
  const migration = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("./migrations/010a_lab_assets_legacy_compat.sql", import.meta.url), "utf8")
  );

  assert.match(migration, /ALTER TABLE IF EXISTS lab_platform_types[\s\S]*ADD COLUMN IF NOT EXISTS sort_order integer/i);
  assert.match(migration, /ALTER TABLE IF EXISTS lab_platforms[\s\S]*ADD COLUMN IF NOT EXISTS type_id bigint/i);
  assert.match(migration, /ALTER TABLE IF EXISTS lab_assets[\s\S]*ADD COLUMN IF NOT EXISTS share_scope varchar\(32\)/i);
  assert.match(migration, /ALTER TABLE IF EXISTS lab_platform_notes[\s\S]*ADD COLUMN IF NOT EXISTS content_en text/i);
  assert.match(migration, /ALTER TABLE IF EXISTS lab_asset_notes[\s\S]*ADD COLUMN IF NOT EXISTS content_en text/i);
  assert.match(migration, /missing required legacy column/i);
  assert.doesNotMatch(migration, /DROP (?:TABLE|COLUMN|CONSTRAINT)/i);
});

test("lab assets migration preserves legacy tables and adds revision state", async () => {
  const migration = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("./migrations/011_lab_assets_admin.sql", import.meta.url), "utf8")
  );

  for (const table of ["lab_platform_types", "lab_platforms", "lab_assets", "lab_platform_notes", "lab_asset_notes"]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, "i"));
  }
  assert.match(migration, /INSERT INTO site_content_revisions \(module_key\)[\s\S]*'lab-assets'/i);
  assert.match(migration, /ON CONFLICT \(module_key\) DO NOTHING/i);
  assert.match(migration, /information_schema\.columns/i);
  assert.match(migration, /incompatible type/i);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_lab_assets_platform_sort/i);
  assert.doesNotMatch(migration, /DROP (?:TABLE|COLUMN|CONSTRAINT)/i);
});

test("site-admin round-trip migration is additive, idempotent, and revision guarded", async () => {
  const migration = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("./migrations/009_site_admin_roundtrip.sql", import.meta.url), "utf8")
  );
  assert.match(migration, /ADD COLUMN IF NOT EXISTS variant text/i);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS value_zh text/i);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS value_en text/i);
  assert.match(migration, /revision_type IS DISTINCT FROM 'int8'/i);
  assert.match(migration, /revision < 0/i);
  assert.match(migration, /NOT EXISTS/i);
  assert.doesNotMatch(migration, /DROP (?:TABLE|COLUMN|CONSTRAINT)/i);
});

test("site-admin link variant migration is additive, idempotent, and type guarded", async () => {
  const migration = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("./migrations/010_site_admin_link_variants.sql", import.meta.url), "utf8")
  );

  assert.match(migration, /team_member_links[\s\S]*ADD COLUMN IF NOT EXISTS variant text/i);
  assert.match(migration, /news_items[\s\S]*ADD COLUMN IF NOT EXISTS link_variant text/i);
  assert.match(migration, /information_schema\.columns/i);
  assert.match(migration, /team_member_links.*variant.*incompatible type/is);
  assert.match(migration, /news_items.*link_variant.*incompatible type/is);
  assert.match(migration, /expected text/i);
  assert.doesNotMatch(migration, /ALTER TABLE research_item_links/i);
  assert.doesNotMatch(migration, /DROP (?:TABLE|COLUMN|CONSTRAINT)/i);
});

test("site-admin revision migration defines and initializes repository revision state", async () => {
  const migration = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("./migrations/008_site_admin_revisions.sql", import.meta.url), "utf8")
  );

  assert.match(migration, /CREATE TABLE IF NOT EXISTS site_content_revisions/i);
  assert.match(migration, /module_key text PRIMARY KEY/i);
  assert.match(migration, /revision bigint NOT NULL DEFAULT 0 CHECK \(revision >= 0\)/i);
  assert.match(migration, /updated_at timestamptz NOT NULL DEFAULT now\(\)/i);
  assert.match(migration, /INSERT INTO site_content_revisions \(module_key\)/i);

  for (const moduleKey of [
    "page:site",
    "page:home",
    "page:research_page",
    "page:news_page",
    "page:team_page",
    "page:facilities_page",
    "page:contact_page",
    "research-items",
    "news-items",
    "team-members",
    "facility-items",
    "contact-items"
  ]) {
    assert.match(migration, new RegExp(`'${moduleKey}'`));
  }

  assert.match(migration, /ON CONFLICT \(module_key\) DO NOTHING/i);
});

test("public-site compatibility migration is guarded, typed, and idempotent", async () => {
  const migration = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("./migrations/007_public_site_compatibility.sql", import.meta.url), "utf8")
  );

  assert.match(migration, /ADD COLUMN IF NOT EXISTS content_json jsonb/i);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS publication_year integer/i);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS image_asset_id uuid/i);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS highlight boolean/i);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS team_member_id bigint/i);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS facility_item_id bigint/i);
  assert.match(migration, /DO \$compatibility\$/i);
  assert.match(migration, /information_schema\.columns/i);
  assert.match(migration, /incompatible type/i);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_research_items_sort/i);
  assert.match(migration, /duplicate_object/i);
  assert.doesNotMatch(migration, /DROP (?:TABLE|COLUMN|CONSTRAINT)/i);
});

test("public-site compatibility validates referenced keys and types before adding foreign keys", async () => {
  const migration = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("./migrations/007_public_site_compatibility.sql", import.meta.url), "utf8")
  );

  const guardIndex = migration.indexOf("DO $key_compatibility$");
  const foreignKeyIndex = migration.indexOf("FOREIGN KEY");

  assert.ok(guardIndex >= 0, "expected the RNAV key compatibility guard");
  assert.ok(foreignKeyIndex > guardIndex, "expected key compatibility checks before foreign keys");
  assert.match(migration, /research_items_id_key_compat/i);
  assert.match(migration, /team_members_id_key_compat/i);
  assert.match(migration, /facility_items_id_key_compat/i);
  assert.match(migration, /research_items.*required cleanup/is);
  assert.match(migration, /team_members.*required cleanup/is);
  assert.match(migration, /facility_items.*required cleanup/is);
  assert.match(migration, /incompatible.*child/is);
  assert.match(migration, /contype IN \('p', 'u'\)/i);
});

test("runMigrations acquires the transaction lock before inspecting migration state", async () => {
  const client = new RecordingClient();

  await withMigrationDirectory((migrationDirectoryUrl) =>
    runMigrations("postgres://test", {
      clientFactory: () => client,
      migrationDirectoryUrl
    })
  );

  const queries = client.calls.map((call) => call.sql);
  const beginIndex = queries.indexOf("BEGIN");
  const lockIndex = queries.findIndex((sql) => sql.includes("pg_advisory_xact_lock"));
  const stateIndex = queries.findIndex((sql) => sql.includes("checksum IS NULL"));

  assert.ok(beginIndex >= 0);
  assert.ok(lockIndex > beginIndex);
  assert.ok(stateIndex > lockIndex);
});

test("runMigrations skips an applied migration with a matching checksum", async () => {
  const client = new RecordingClient(({ sql }) => {
    if (isAppliedMigrationQuery(sql)) {
      return { rowCount: 1, rows: [{ checksum: migrationChecksum }] };
    }
    return { rowCount: 0, rows: [] };
  });

  await withMigrationDirectory((migrationDirectoryUrl) =>
    runMigrations("postgres://test", {
      clientFactory: () => client,
      migrationDirectoryUrl
    })
  );

  assert.equal(client.calls.some(({ sql }) => sql === migrationSql), false);
  assert.equal(
    client.calls.some(({ sql }) => sql.includes("INSERT INTO schema_migrations")),
    false
  );
  assert.equal(client.calls.at(-1)?.sql, "COMMIT");
  assert.equal(client.endCount, 1);
});

test("runMigrations rolls back when an applied migration checksum differs", async () => {
  const client = new RecordingClient(({ sql }) => {
    if (isAppliedMigrationQuery(sql)) {
      return { rowCount: 1, rows: [{ checksum: "different-checksum" }] };
    }
    return { rowCount: 0, rows: [] };
  });

  await assert.rejects(
    withMigrationDirectory((migrationDirectoryUrl) =>
      runMigrations("postgres://test", {
        clientFactory: () => client,
        migrationDirectoryUrl
      })
    ),
    /Migration checksum mismatch for 001_test\.sql/
  );

  assert.equal(client.calls.at(-1)?.sql, "ROLLBACK");
  assert.equal(client.endCount, 1);
});

test("runMigrations rejects unverifiable legacy migration rows", async () => {
  const client = new RecordingClient(({ sql }) => {
    if (sql.includes("checksum IS NULL")) {
      return { rowCount: 1, rows: [{ version: "001_legacy.sql" }] };
    }
    return { rowCount: 0, rows: [] };
  });

  await assert.rejects(
    withMigrationDirectory((migrationDirectoryUrl) =>
      runMigrations("postgres://test", {
        clientFactory: () => client,
        migrationDirectoryUrl
      })
    ),
    /Migration 001_legacy\.sql has no checksum/
  );

  assert.equal(client.calls.at(-1)?.sql, "ROLLBACK");
  assert.equal(client.endCount, 1);
});

test("runMigrations records a successful migration with its checksum", async () => {
  const client = new RecordingClient();

  await withMigrationDirectory((migrationDirectoryUrl) =>
    runMigrations("postgres://test", {
      clientFactory: () => client,
      migrationDirectoryUrl
    })
  );

  const insert = client.calls.find(({ sql }) =>
    sql.includes("INSERT INTO schema_migrations")
  );
  assert.equal(client.calls.some(({ sql }) => sql === migrationSql), true);
  assert.deepEqual(insert?.values, [migrationName, migrationChecksum]);
  assert.equal(client.calls.at(-1)?.sql, "COMMIT");
  assert.equal(client.connectCount, 1);
  assert.equal(client.endCount, 1);
});

test("runMigrations rolls back and ends the client when migration SQL fails", async () => {
  const client = new RecordingClient(({ sql }) => {
    if (sql === migrationSql) {
      throw new Error("broken migration");
    }
    return { rowCount: 0, rows: [] };
  });

  await assert.rejects(
    withMigrationDirectory((migrationDirectoryUrl) =>
      runMigrations("postgres://test", {
        clientFactory: () => client,
        migrationDirectoryUrl
      })
    ),
    /broken migration/
  );

  assert.equal(client.calls.some(({ sql }) => sql === "COMMIT"), false);
  assert.equal(client.calls.at(-1)?.sql, "ROLLBACK");
  assert.equal(client.endCount, 1);
});

test("runMigrations preserves the primary error when rollback fails", async () => {
  const migrationError = new Error("primary migration failure");
  const rollbackError = new Error("rollback failure");
  const client = new RecordingClient(({ sql }) => {
    if (sql === migrationSql) {
      throw migrationError;
    }
    if (sql === "ROLLBACK") {
      throw rollbackError;
    }
    return { rowCount: 0, rows: [] };
  });

  const thrown = await withMigrationDirectory(async (migrationDirectoryUrl) => {
    try {
      await runMigrations("postgres://test", {
        clientFactory: () => client,
        migrationDirectoryUrl
      });
      assert.fail("expected migration failure");
    } catch (error) {
      return error as MigrationErrorWithCleanupFailures;
    }
  });

  assert.equal(thrown, migrationError);
  assert.deepEqual(thrown.migrationCleanupFailures, [rollbackError]);
  assert.equal(client.endCount, 1);
});

test("runMigrations retains rollback and end failures on the primary error", async () => {
  const migrationError = new Error("primary migration failure");
  const rollbackError = new Error("rollback failure");
  const endError = new Error("end failure");
  const client = new RecordingClient(({ sql }) => {
    if (sql === migrationSql) {
      throw migrationError;
    }
    if (sql === "ROLLBACK") {
      throw rollbackError;
    }
    return { rowCount: 0, rows: [] };
  });
  client.endError = endError;

  const thrown = await withMigrationDirectory(async (migrationDirectoryUrl) => {
    try {
      await runMigrations("postgres://test", {
        clientFactory: () => client,
        migrationDirectoryUrl
      });
      assert.fail("expected migration failure");
    } catch (error) {
      return error as MigrationErrorWithCleanupFailures;
    }
  });

  assert.equal(thrown, migrationError);
  assert.deepEqual(thrown.migrationCleanupFailures, [rollbackError, endError]);
  assert.equal(client.endCount, 1);
});
