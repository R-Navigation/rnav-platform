import "dotenv/config";
import pg from "pg";
import { loadEnv } from "../../server/config/env.js";
import { createCrossrefClient } from "../../server/services/scholarly-sync/providers/crossrefClient.js";
import { createOpenAlexClient } from "../../server/services/scholarly-sync/providers/openAlexClient.js";
import { createScholarlySyncRepository } from "../../server/services/scholarly-sync/repository.js";
import { createScholarlySyncService } from "../../server/services/scholarly-sync/service.js";
import { createScholarlySyncSettingsService } from "../../server/services/settings/scholarlySyncSettingsService.js";

const env = loadEnv();
const pool = new pg.Pool({ connectionString: env.databaseUrl });
try {
  const settings = createScholarlySyncSettingsService(pool, {
    encryptionSecret: env.sessionSecret,
    fallbacks: { enabled: env.scholarlySyncEnabled, openAlexApiKey: env.openAlexApiKey, crossrefContactEmail: env.scholarlySyncContactEmail },
  });
  const runtime = await settings.getRuntimeConfig();
  if (!runtime.enabled) {
    console.log("Scholarly Sync is disabled; nothing to do.");
  } else {
  const service = createScholarlySyncService({
    pool, repository: createScholarlySyncRepository(pool),
    openAlex: createOpenAlexClient({ baseUrl: env.scholarlySyncOpenAlexBaseUrl, apiKey: async () => (await settings.getRuntimeConfig()).openAlexApiKey }),
    crossref: createCrossrefClient({ baseUrl: env.scholarlySyncCrossrefBaseUrl, contactEmail: async () => (await settings.getRuntimeConfig()).crossrefContactEmail }),
    enabled: async () => (await settings.getRuntimeConfig()).enabled,
    providerConfig: async () => {
      const config = await settings.getRuntimeConfig();
      return { openAlexKeyConfigured: Boolean(config.openAlexApiKey), crossrefContactConfigured: Boolean(config.crossrefContactEmail) };
    },
  });
  const result = await service.syncAll(null, true);
  console.log(JSON.stringify({ runId: result.runId ?? null, skipped: result.skipped, status: result.status, membersChecked: result.membersChecked, worksSeen: result.worksSeen, candidatesCreated: result.candidatesCreated, worksUpdated: result.worksUpdated, failures: result.failures }));
  if (result.status === "failed") process.exitCode = 1;
  }
} finally { await pool.end(); }
