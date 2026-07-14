import assert from "node:assert/strict";
import test from "node:test";
import { createSettingsService, SettingsError } from "./settingsService.js";

class Client {
  calls: Array<{ sql: string; values?: unknown[] }> = [];
  async query(sql: string, values?: unknown[]) { this.calls.push({ sql, values }); if (sql.includes("UPDATE system_settings")) return { rowCount: 0, rows: [] }; return { rowCount: 1, rows: [] }; }
  release() {}
}

test("settings update uses optimistic versioning and rolls back conflicts", async () => {
  const client = new Client(); const service = createSettingsService({ connect: async () => client } as never);
  await assert.rejects(service.update("site", { groupName: "RNAV" }, 1, "user-1"), (error: unknown) => error instanceof SettingsError && error.code === "SETTING_CONFLICT");
  assert.equal(client.calls.at(-1)?.sql, "ROLLBACK");
});

test("settings reject unknown keys", async () => {
  const service = createSettingsService({ connect: async () => { throw new Error("unused"); } } as never);
  await assert.rejects(service.update("unknown", {}, 1, "user-1"), (error: unknown) => error instanceof SettingsError && error.code === "SETTING_INVALID");
});
