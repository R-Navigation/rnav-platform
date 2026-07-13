import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { parseArgs, readJson, requiredArg, writeJson } from "./common.js";
import type { TableExport, UnifiedUserSeed, VerificationResult } from "./migrationTypes.js";

export async function verifyMigration(input: string, targetDb: string) {
  const [users, publicSite, labAssets, monitor] = await Promise.all([readJson<UnifiedUserSeed[]>(`${input}/users.json`), readJson<TableExport>(`${input}/public-site.json`), readJson<TableExport>(`${input}/lab-assets.json`), readJson<TableExport>(`${input}/monitor.json`)]);
  const expectations: Array<[string, string, number]> = [
    ["users", "users", users.length], ["page content", "page_content", publicSite.page_content?.length ?? 0], ["team members", "team_members", publicSite.team_members?.length ?? 0], ["media assets", "media_assets", publicSite.media_assets?.length ?? 0], ["lab platforms", "lab_platforms", labAssets.lab_platforms?.length ?? 0], ["lab assets", "lab_assets", labAssets.lab_assets?.length ?? 0], ["monitor devices", "devices", monitor.devices?.length ?? 0], ["monitor telemetry", "device_telemetry", monitor.device_telemetry?.length ?? 0], ["monitor events", "device_events", monitor.device_events?.length ?? 0], ["monitor alerts", "device_alerts", monitor.device_alerts?.length ?? 0],
  ];
  const client = new pg.Client({ connectionString: targetDb }); await client.connect(); const results: VerificationResult[] = [];
  try { for (const [key, table, expected] of expectations) { const actual = Number((await client.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count); results.push({ key, expected, actual, passed: expected === actual }); } }
  finally { await client.end(); }
  const report = { verifiedAt: new Date().toISOString(), passed: results.every((result) => result.passed), results };
  const output = resolve(input, "verification-report.json"); await writeJson(output, report);
  const markdown = [`# RNAV Migration Verification`, "", `Overall: ${report.passed ? "PASS" : "FAIL"}`, "", "| Check | Expected | Actual | Result |", "|---|---:|---:|---|", ...results.map((result) => `| ${result.key} | ${result.expected} | ${result.actual} | ${result.passed ? "PASS" : "FAIL"} |`), ""].join("\n");
  await writeFile(resolve(input, "verification-report.md"), markdown, "utf8"); return report;
}

if (import.meta.url === `file://${process.argv[1]}`) { const args = parseArgs(); verifyMigration(requiredArg(args, "in"), requiredArg(args, "target-db")).then((report) => { console.log(report.passed ? "Migration verification passed" : "Migration verification failed"); if (!report.passed) process.exitCode = 1; }).catch((error) => { console.error(error); process.exitCode = 1; }); }
