export type JsonRecord = Record<string, unknown>;

export type LegacyWebsiteAdminUser = { id: string | number; username: string; password_hash: string; created_at?: string; updated_at?: string };
export type LegacyMonitorUser = { id: string; username: string; password_hash: string; role: string; display_name: string; is_active: boolean; last_login_at?: string | null };
export type UnifiedUserSeed = { username: string; displayName: string; passwordHash: string; baseTier: "normal" | "super"; status: "active" | "disabled"; permissions: string[]; sources: string[] };
export type LegacyPageContent = { page_key: string; content_json: unknown; updated_at: string };
export type LegacyMonitorDevice = JsonRecord & { id: string; code: string; auth_token_hash: string };
export type MigrationConflict = { type: string; key: string; resolution: string; detail: JsonRecord };
export type MigrationManifest = { version: 1; exportedAt: string; sources: Record<string, { database: string; tables: Record<string, number> }>; files: Record<string, { sha256: string; records: number }> };
export type VerificationResult = { key: string; expected: number; actual: number; passed: boolean };
export type TableExport = Record<string, JsonRecord[]>;

export type TransformedExport = {
  users: UnifiedUserSeed[];
  publicSite: TableExport;
  labAssets: TableExport;
  monitor: TableExport;
  conflicts: MigrationConflict[];
};
