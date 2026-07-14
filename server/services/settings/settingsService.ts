import type { Pool } from "pg";

export class SettingsError extends Error { constructor(message: string, readonly code: string, readonly status = 400) { super(message); this.name = "SettingsError"; } }
const keys = ["site", "locale", "security", "monitor", "procurement", "media", "maintenance"] as const;
type SettingKey = typeof keys[number];
const allowed = new Set<string>(keys);
export function createSettingsService(pool: Pick<Pool, "query" | "connect">) {
  return {
    async getAll() { const result = await pool.query<{ key: SettingKey; value_json: unknown; version: string; updated_at: string }>("SELECT key,value_json,version::text,updated_at FROM system_settings ORDER BY key"); return result.rows.map(row => ({ key: row.key, value: row.value_json, version: Number(row.version), updatedAt: row.updated_at })); },
    async update(key: string, value: unknown, version: number, actorId: string) { if (!allowed.has(key)) throw new SettingsError("不支持的系统设置", "SETTING_INVALID"); const client=await pool.connect();try{await client.query("BEGIN");const result=await client.query<{key:string;value_json:unknown;version:string;updated_at:string}>("UPDATE system_settings SET value_json=$2,version=version+1,updated_by=$3,updated_at=now() WHERE key=$1 AND version=$4 RETURNING key,value_json,version::text,updated_at",[key,value,actorId,version]);if(!result.rows[0])throw new SettingsError("设置已被其他管理员更新，请重新加载","SETTING_CONFLICT",409);await client.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,'settings.update','system_setting',$2::text,$3::jsonb)",[actorId,key,JSON.stringify({key,version:result.rows[0].version})]);await client.query("COMMIT");const row=result.rows[0];return{key:row.key,value:row.value_json,version:Number(row.version),updatedAt:row.updated_at};}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}}
  };
}
export type SettingsService=ReturnType<typeof createSettingsService>;
