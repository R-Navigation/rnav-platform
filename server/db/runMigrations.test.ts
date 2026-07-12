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
      "006_public_site_legacy.sql"
    ]
  );
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
