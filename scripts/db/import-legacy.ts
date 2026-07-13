import pg, { type Client } from "pg";
import { parseArgs, readJson, requiredArg } from "./common.js";
import type { JsonRecord, TableExport, UnifiedUserSeed } from "./migrationTypes.js";

const publicOrder = ["media_assets", "page_content", "research_items", "research_item_authors", "research_item_keywords", "research_item_links", "news_items", "team_members", "team_member_contacts", "team_member_links", "facility_items", "facility_item_specs", "contact_primary_channels", "contact_social_links", "contact_extra_cards"];
const labOrder = ["lab_platform_types", "lab_platforms", "lab_platform_notes", "lab_assets", "lab_asset_notes"];
const monitorOrder = ["device_categories", "devices", "device_current_state", "device_telemetry", "device_events", "device_alerts", "monitor_service_status", "dashboard_settings"];

function quote(identifier: string) { if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) throw new Error(`Unsafe identifier ${identifier}`); return `"${identifier}"`; }

async function upsertRows(client: Client, table: string, rows: JsonRecord[]) {
  for (const row of rows) {
    const columns = Object.keys(row); if (!columns.length) continue;
    const values = columns.map((column) => row[column]);
    const updates = columns.filter((column) => !["id", "page_key", "code", "service_key", "request_no", "username"].includes(column));
    const conflict = table === "page_content" ? "page_key" : table === "monitor_service_status" ? "service_key" : table === "admin_users" ? "username" : columns.includes("id") ? "id" : columns.includes("code") ? "code" : null;
    const suffix = conflict ? ` ON CONFLICT (${quote(conflict)}) DO ${updates.length ? `UPDATE SET ${updates.map((column) => `${quote(column)} = EXCLUDED.${quote(column)}`).join(", ")}` : "NOTHING"}` : "";
    await client.query(`INSERT INTO ${quote(table)} (${columns.map(quote).join(",")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(",")})${suffix}`, values);
  }
}

async function moduleTransaction(client: Client, dryRun: boolean, invoke: () => Promise<void>) {
  await client.query("BEGIN"); try { await invoke(); await client.query(dryRun ? "ROLLBACK" : "COMMIT"); } catch (error) { await client.query("ROLLBACK"); throw error; }
}

export async function importLegacy({ input, targetDb, dryRun }: { input: string; targetDb: string; dryRun: boolean }) {
  const [users, publicSite, labAssets, monitor] = await Promise.all([readJson<UnifiedUserSeed[]>(`${input}/users.json`), readJson<TableExport>(`${input}/public-site.json`), readJson<TableExport>(`${input}/lab-assets.json`), readJson<TableExport>(`${input}/monitor.json`)]);
  const client = new pg.Client({ connectionString: targetDb }); await client.connect();
  try {
    await moduleTransaction(client, dryRun, async () => { for (const user of users) await client.query(`INSERT INTO users (username, password_hash, base_tier, display_name, status) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (username) DO UPDATE SET password_hash=EXCLUDED.password_hash, base_tier=EXCLUDED.base_tier, display_name=EXCLUDED.display_name, status=EXCLUDED.status, updated_at=now()`, [user.username, user.passwordHash, user.baseTier, user.displayName, user.status]); });
    await moduleTransaction(client, dryRun, async () => { for (const table of publicOrder) await upsertRows(client, table, publicSite[table] ?? []); });
    await moduleTransaction(client, dryRun, async () => { for (const table of labOrder) await upsertRows(client, table, labAssets[table] ?? []); });
    await moduleTransaction(client, dryRun, async () => {
      const usersByLegacyId = new Map<string, string>();
      for (const user of users) for (const source of user.sources) if (source === "monitor") usersByLegacyId.set(user.username, user.username);
      for (const table of monitorOrder) {
        const rows = (monitor[table] ?? []).map((row) => table === "device_alerts" && row.acknowledged_by ? { ...row, legacy_acknowledged_by: row.acknowledged_by, acknowledged_by: null } : row);
        await upsertRows(client, table, rows);
      }
    });
    return { dryRun, users: users.length, publicRows: Object.values(publicSite).reduce((sum, rows) => sum + rows.length, 0), labRows: Object.values(labAssets).reduce((sum, rows) => sum + rows.length, 0), monitorRows: Object.values(monitor).reduce((sum, rows) => sum + rows.length, 0) };
  } finally { await client.end(); }
}

if (import.meta.url === `file://${process.argv[1]}`) { const args = parseArgs(); importLegacy({ input: requiredArg(args, "in"), targetDb: requiredArg(args, "target-db"), dryRun: args.has("dry-run") }).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error); process.exitCode = 1; }); }
