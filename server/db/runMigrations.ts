import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

export type MigrationQueryResult = {
  rowCount: number | null;
  rows: Record<string, unknown>[];
};

export interface MigrationClient {
  connect(): Promise<void>;
  query(sql: string, values?: readonly unknown[]): Promise<MigrationQueryResult>;
  end(): Promise<void>;
}

export type MigrationErrorWithCleanupFailures = Error & {
  migrationCleanupFailures?: unknown[];
};

type MigrationOptions = {
  clientFactory?: (databaseUrl: string) => MigrationClient;
  migrationDirectoryUrl?: URL;
};

// Stable application-specific key used to serialize all RNAV schema migrations.
export const MIGRATION_ADVISORY_LOCK_KEY = 724866120001;

function attachCleanupFailure(primaryError: unknown, cleanupError: unknown) {
  if (!(primaryError instanceof Error)) {
    return;
  }

  const error = primaryError as MigrationErrorWithCleanupFailures;
  error.migrationCleanupFailures ??= [];
  error.migrationCleanupFailures.push(cleanupError);
}

function createPgClient(databaseUrl: string): MigrationClient {
  const client = new pg.Client({ connectionString: databaseUrl });
  return {
    connect: async () => {
      await client.connect();
    },
    query: async (sql: string, values?: readonly unknown[]) => {
      const result = await client.query<Record<string, unknown>>(
        sql,
        values ? [...values] : undefined
      );
      return result;
    },
    end: () => client.end()
  };
}

export async function getMigrationFiles(directoryUrl: URL) {
  const directory = fileURLToPath(directoryUrl);
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function runMigrations(
  databaseUrl = process.env.DATABASE_URL,
  options: MigrationOptions = {}
) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const client = (options.clientFactory ?? createPgClient)(databaseUrl);
  let transactionStarted = false;
  let primaryError: unknown;
  let hasPrimaryError = false;

  try {
    await client.connect();

    const migrationDir =
      options.migrationDirectoryUrl ?? new URL("./migrations/", import.meta.url);
    const migrationPath = fileURLToPath(migrationDir);
    const files = await getMigrationFiles(migrationDir);

    await client.query("BEGIN");
    transactionStarted = true;
    await client.query("SELECT pg_advisory_xact_lock($1)", [
      MIGRATION_ADVISORY_LOCK_KEY
    ]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(
      "ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text"
    );

    const unverifiable = await client.query(`
      SELECT version
      FROM schema_migrations
      WHERE checksum IS NULL
      ORDER BY version
      LIMIT 1
    `);

    if (unverifiable.rowCount) {
      const version = String(unverifiable.rows[0].version);
      throw new Error(
        `Migration ${version} has no checksum; verify and backfill it before running migrations`
      );
    }

    await client.query(
      "ALTER TABLE schema_migrations ALTER COLUMN checksum SET NOT NULL"
    );

    for (const file of files) {
      const version = file.name;
      const sql = await readFile(join(migrationPath, file.name), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const alreadyApplied = await client.query(
        "SELECT checksum FROM schema_migrations WHERE version = $1",
        [version]
      );

      if (alreadyApplied.rowCount) {
        const appliedChecksum = String(alreadyApplied.rows[0].checksum);
        if (appliedChecksum !== checksum) {
          throw new Error(
            `Migration checksum mismatch for ${version}: expected ${appliedChecksum}, got ${checksum}`
          );
        }
        continue;
      }

      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)",
        [version, checksum]
      );
    }

    await client.query("COMMIT");
    transactionStarted = false;
  } catch (error) {
    primaryError = error;
    hasPrimaryError = true;
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        attachCleanupFailure(primaryError, rollbackError);
      }
    }
  }

  try {
    await client.end();
  } catch (endError) {
    if (!hasPrimaryError) {
      throw endError;
    }
    attachCleanupFailure(primaryError, endError);
  }

  if (hasPrimaryError) {
    throw primaryError;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
