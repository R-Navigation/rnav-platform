import "dotenv/config";
import pg from "pg";
import { loadEnv } from "../../server/config/env.js";
import { mapPublicationType, normalizeWork, providerHash } from "../../server/services/scholarly-sync/normalizer.js";
import { createCrossrefClient } from "../../server/services/scholarly-sync/providers/crossrefClient.js";
import { createOpenAlexClient } from "../../server/services/scholarly-sync/providers/openAlexClient.js";

const env = loadEnv(); const pool = new pg.Pool({ connectionString: env.databaseUrl });
const lock = 724866120042; const client = await pool.connect();
let locked = false;
try {
  locked = Boolean((await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1) locked", [lock])).rows[0]?.locked);
  if (!locked) { console.log("Another publication backfill is running; skipped."); process.exit(0); }
  const openAlex = createOpenAlexClient({ baseUrl: env.scholarlySyncOpenAlexBaseUrl, apiKey: env.openAlexApiKey });
  const crossref = createCrossrefClient({ baseUrl: env.scholarlySyncCrossrefBaseUrl, contactEmail: env.scholarlySyncContactEmail });
  const works = await client.query<{ id: string; research_item_id: string; doi_normalized: string }>("SELECT id,research_item_id,doi_normalized FROM scholarly_works WHERE source_type='manual' AND decision='accepted' AND doi_normalized IS NOT NULL AND openalex_work_id IS NULL ORDER BY research_item_id");
  let matched = 0; const failures: Array<{ researchItemId: string; message: string }> = [];
  for (const work of works.rows) {
    try {
      const raw = await openAlex.getWorkByDoi(work.doi_normalized); let normalized = normalizeWork(raw); let enriched = false;
      try { normalized = normalizeWork(raw, await crossref.getWorkByDoi(work.doi_normalized)); enriched = true; } catch { /* OpenAlex match remains valid */ }
      const snapshot = { normalized: { ...normalized, mappedType: mapPublicationType(normalized.providerType) }, crossrefEnriched: enriched };
      await client.query("UPDATE scholarly_works SET openalex_work_id=$2,source_snapshot=$3::jsonb,provider_hash=$4,provider_updated_at=$5,last_seen_at=now(),last_synced_at=now(),version=version+1 WHERE id=$1", [work.id, normalized.openalexWorkId, JSON.stringify(snapshot), providerHash(normalized), normalized.providerUpdatedAt]);
      matched += 1;
    } catch (error) { failures.push({ researchItemId: work.research_item_id, message: error instanceof Error ? error.message.slice(0, 200) : "Unknown provider error" }); }
  }
  console.log(JSON.stringify({ checked: works.rowCount, matched, failures }));
  if (failures.length === works.rowCount && works.rowCount) process.exitCode = 1;
} finally {
  if (locked) await client.query("SELECT pg_advisory_unlock($1)", [lock]).catch(() => undefined);
  client.release(); await pool.end();
}
