import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { parseArgs, records, requiredArg, sha256, writeJson } from "./common.js";
import type { MigrationManifest, TableExport } from "./migrationTypes.js";

const websiteContentTables = ["page_content", "research_items", "research_item_authors", "research_item_keywords", "research_item_links", "news_items", "team_members", "team_member_contacts", "team_member_links", "facility_items", "facility_item_specs", "contact_primary_channels", "contact_social_links", "contact_extra_cards"];
const websiteUserTables = ["admin_users"];
const mediaTables = ["media_assets"];
const labTables = ["lab_platform_types", "lab_platforms", "lab_platform_notes", "lab_assets", "lab_asset_notes"];
const monitorTables = ["dashboard_settings", "device_categories", "devices", "device_current_state", "device_telemetry", "device_events", "device_alerts", "monitor_service_status"];
const monitorUserTables = ["monitor_users"];

async function exportTables(databaseUrl: string, tables: string[]) {
  const client = new pg.Client({ connectionString: databaseUrl }); await client.connect();
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const exported: TableExport = {};
    for (const table of tables) exported[table] = (await client.query(`SELECT * FROM ${table} ORDER BY 1`)).rows;
    await client.query("COMMIT"); return exported;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { await client.end(); }
}

export async function exportLegacy({ websiteDb, monitorDb, out }: { websiteDb: string; monitorDb: string; out: string }) {
  const [websiteContent, websiteUsers, mediaAssets, labAssets, monitorData, monitorUsers] = await Promise.all([
    exportTables(websiteDb, websiteContentTables), exportTables(websiteDb, websiteUserTables), exportTables(websiteDb, mediaTables), exportTables(websiteDb, labTables), exportTables(monitorDb, monitorTables), exportTables(monitorDb, monitorUserTables),
  ]);
  const payloads = { "website-content.json": websiteContent, "website-users.json": websiteUsers, "media-assets.json": mediaAssets, "lab-assets.json": labAssets, "monitor-data.json": monitorData, "monitor-users.json": monitorUsers };
  const files: MigrationManifest["files"] = {};
  for (const [filename, payload] of Object.entries(payloads)) { await writeJson(`${out}/${filename}`, payload); const source = await readFile(resolve(out, filename), "utf8"); files[filename] = { sha256: sha256(source), records: records(payload) }; }
  const tableCounts = (payload: TableExport) => Object.fromEntries(Object.entries(payload).map(([table, rows]) => [table, rows.length]));
  const manifest: MigrationManifest = { version: 1, exportedAt: new Date().toISOString(), sources: { website: { database: new URL(websiteDb).pathname.slice(1), tables: { ...tableCounts(websiteContent), ...tableCounts(websiteUsers), ...tableCounts(mediaAssets), ...tableCounts(labAssets) } }, monitor: { database: new URL(monitorDb).pathname.slice(1), tables: { ...tableCounts(monitorData), ...tableCounts(monitorUsers) } } }, files };
  await writeJson(`${out}/manifest.json`, manifest); return manifest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(); exportLegacy({ websiteDb: requiredArg(args, "website-db"), monitorDb: requiredArg(args, "monitor-db"), out: requiredArg(args, "out") }).then((manifest) => console.log(`Exported ${Object.values(manifest.files).reduce((sum, file) => sum + file.records, 0)} records`)).catch((error) => { console.error(error); process.exitCode = 1; });
}
