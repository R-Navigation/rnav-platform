import "dotenv/config";
import pg from "pg";
import { loadEnv } from "../../server/config/env.js";
import { createCrossrefClient } from "../../server/services/scholarly-sync/providers/crossrefClient.js";
import { createOpenAlexClient } from "../../server/services/scholarly-sync/providers/openAlexClient.js";
import { createScholarlySyncRepository } from "../../server/services/scholarly-sync/repository.js";
import { createScholarlySyncService } from "../../server/services/scholarly-sync/service.js";

const env = loadEnv();
if (!env.scholarlySyncEnabled) {
  console.log("Scholarly Sync is disabled; nothing to do.");
  process.exit(0);
}
const pool = new pg.Pool({ connectionString: env.databaseUrl });
try {
  const service = createScholarlySyncService({
    pool, repository: createScholarlySyncRepository(pool),
    openAlex: createOpenAlexClient({ baseUrl: env.scholarlySyncOpenAlexBaseUrl, apiKey: env.openAlexApiKey }),
    crossref: createCrossrefClient({ baseUrl: env.scholarlySyncCrossrefBaseUrl, contactEmail: env.scholarlySyncContactEmail }),
    enabled: true,
    providerConfig: { openAlexKeyConfigured: Boolean(env.openAlexApiKey), crossrefContactConfigured: Boolean(env.scholarlySyncContactEmail) },
  });
  const result = await service.syncAll(null, true);
  console.log(JSON.stringify({ runId: result.runId ?? null, skipped: result.skipped, status: result.status, membersChecked: result.membersChecked, worksSeen: result.worksSeen, candidatesCreated: result.candidatesCreated, worksUpdated: result.worksUpdated, failures: result.failures }));
  if (result.status === "failed") process.exitCode = 1;
} finally { await pool.end(); }
