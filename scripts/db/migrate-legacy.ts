import { resolve } from "node:path";
import { parseArgs, readJson, requiredArg, writeJson } from "./common.js";
import type { LegacyMonitorUser, LegacyWebsiteAdminUser, MigrationConflict, TableExport, TransformedExport, UnifiedUserSeed } from "./migrationTypes.js";

type UsernameMap = { users?: Array<{ unifiedUsername: string; websiteAdminUsername?: string; monitorUsername?: string; displayName?: string; baseTier?: "normal" | "super" }> };

function suffix(username: string, source: string, used: Set<string>) { let candidate = `${username}-${source}`; let index = 2; while (used.has(candidate)) candidate = `${username}-${source}-${index++}`; return candidate; }

export function transformUsers(websiteUsers: LegacyWebsiteAdminUser[], monitorUsers: LegacyMonitorUser[], usernameMap: UsernameMap) {
  const conflicts: MigrationConflict[] = []; const users: UnifiedUserSeed[] = []; const used = new Set<string>();
  const website = new Map(websiteUsers.map((user) => [user.username, user])); const monitor = new Map(monitorUsers.map((user) => [user.username, user]));
  for (const mapping of usernameMap.users ?? []) {
    const site = mapping.websiteAdminUsername ? website.get(mapping.websiteAdminUsername) : undefined; const screen = mapping.monitorUsername ? monitor.get(mapping.monitorUsername) : undefined;
    if (!site && !screen) { conflicts.push({ type: "username-map-missing", key: mapping.unifiedUsername, resolution: "skipped", detail: mapping }); continue; }
    users.push({ username: mapping.unifiedUsername, displayName: mapping.displayName ?? screen?.display_name ?? mapping.unifiedUsername, passwordHash: site?.password_hash ?? screen!.password_hash, baseTier: mapping.baseTier ?? "super", status: screen && !screen.is_active ? "disabled" : "active", permissions: [], sources: [site ? "website" : "", screen ? "monitor" : ""].filter(Boolean) });
    used.add(mapping.unifiedUsername); if (site) website.delete(site.username); if (screen) monitor.delete(screen.username);
  }
  const add = (source: string, user: { username: string; password_hash: string; display_name?: string; is_active?: boolean }) => { let username = user.username; if (used.has(username)) { const renamed = suffix(username, source, used); conflicts.push({ type: "username-collision", key: username, resolution: `renamed to ${renamed}`, detail: { source } }); username = renamed; } used.add(username); users.push({ username, displayName: user.display_name ?? username, passwordHash: user.password_hash, baseTier: "super", status: user.is_active === false ? "disabled" : "active", permissions: [], sources: [source] }); };
  for (const user of website.values()) add("website", user); for (const user of monitor.values()) add("monitor", user);
  return { users, conflicts };
}

export async function migrateLegacy(input: string, usernameMapPath: string) {
  const [websiteContent, websiteUsers, mediaAssets, labAssets, monitorData, monitorUsers, usernameMap] = await Promise.all([
    readJson<TableExport>(`${input}/website-content.json`), readJson<TableExport>(`${input}/website-users.json`), readJson<TableExport>(`${input}/media-assets.json`), readJson<TableExport>(`${input}/lab-assets.json`), readJson<TableExport>(`${input}/monitor-data.json`), readJson<TableExport>(`${input}/monitor-users.json`), readJson<UsernameMap>(usernameMapPath),
  ]);
  const transformedUsers = transformUsers(websiteUsers.admin_users as unknown as LegacyWebsiteAdminUser[], monitorUsers.monitor_users as unknown as LegacyMonitorUser[], usernameMap);
  const transformed: TransformedExport = { users: transformedUsers.users, publicSite: { ...websiteContent, ...mediaAssets }, labAssets, monitor: monitorData, conflicts: transformedUsers.conflicts };
  const out = resolve(input, "transformed");
  await Promise.all([writeJson(`${out}/users.json`, transformed.users), writeJson(`${out}/public-site.json`, transformed.publicSite), writeJson(`${out}/lab-assets.json`, transformed.labAssets), writeJson(`${out}/monitor.json`, transformed.monitor), writeJson(`${out}/conflicts.json`, transformed.conflicts)]); return transformed;
}

if (import.meta.url === `file://${process.argv[1]}`) { const args = parseArgs(); migrateLegacy(requiredArg(args, "in"), requiredArg(args, "username-map")).then((result) => console.log(`Transformed ${result.users.length} users with ${result.conflicts.length} conflicts`)).catch((error) => { console.error(error); process.exitCode = 1; }); }
