import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { mediaMimeTypes } from "./mediaSchemas.js";
import type { CosGateway } from "./cosGateway.js";

export class MediaError extends Error { constructor(message: string, readonly code: string, readonly status = 400) { super(message); this.name = "MediaError"; } }
type MediaInput = { filename: string; mimeType: string; body: Buffer; maxBytes: number; publicBaseUrl: string; pathPrefix: string };
type MediaRow = { id: string; filename: string; object_key: string; url: string; mime_type: string; size_bytes: string; checksum_sha256: string; status: string; recycled_at: string | null; created_at: string; references?: number };
const safeFilename = (filename: string) => filename.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-180) || "upload";

export function createMediaService(pool: Pick<Pool, "query" | "connect">, cos: CosGateway) {
  async function references(client: { query<T = any>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> }, id: string) {
    const result = await client.query<{ count: string }>(`SELECT (
      (SELECT count(*) FROM user_profiles WHERE avatar_asset_id=$1) +
      (SELECT count(*) FROM research_items WHERE image_asset_id=$1 OR pdf_asset_id=$1) +
      (SELECT count(*) FROM news_items WHERE image_asset_id=$1) +
      (SELECT count(*) FROM team_members WHERE image_asset_id=$1) +
      (SELECT count(*) FROM facility_items WHERE image_asset_id=$1) +
      (SELECT count(*) FROM page_content WHERE content_json::text LIKE '%' || $1::text || '%')
    )::text count`, [id]);
    return Number(result.rows[0]?.count ?? 0);
  }
  const map = (row: MediaRow) => ({ id: row.id, filename: row.filename, objectKey: row.object_key, url: row.url, mimeType: row.mime_type, sizeBytes: Number(row.size_bytes), checksumSha256: row.checksum_sha256, status: row.status, recycledAt: row.recycled_at, createdAt: row.created_at, references: Number(row.references ?? 0) });
  return {
    async list(input: { search?: string; status: string }) {
      const result = await pool.query<MediaRow>(`SELECT media_assets.*, 0::bigint references FROM media_assets WHERE status=$1 AND ($2='' OR filename ILIKE '%'||$2||'%' OR object_key ILIKE '%'||$2||'%') ORDER BY created_at DESC LIMIT 200`, [input.status, input.search ?? ""]);
      return result.rows.map(map);
    },
    async getReferences(id: string) {
      return { id, count: await references(pool, id) };
    },
    async upload(input: MediaInput, actorId: string) {
      if (!mediaMimeTypes.includes(input.mimeType as never)) throw new MediaError("不支持的媒体类型", "MEDIA_TYPE_INVALID");
      if (input.body.length < 1 || input.body.length > input.maxBytes) throw new MediaError("媒体文件超过大小限制", "MEDIA_SIZE_INVALID");
      const checksum = createHash("sha256").update(input.body).digest("hex"); const id = randomUUID(); const key = `${input.pathPrefix.replace(/\/$/, "")}/${new Date().toISOString().slice(0,10)}/${id}-${safeFilename(input.filename)}`; const url = `${input.publicBaseUrl.replace(/\/$/, "")}/${key}`;
      try { await cos.putObject({ key, body: input.body, contentType: input.mimeType }); } catch { throw new MediaError("媒体存储服务不可用", "MEDIA_STORAGE_FAILED", 502); }
      const client = await pool.connect(); try { await client.query("BEGIN"); const result = await client.query<MediaRow>(`INSERT INTO media_assets(id,bucket,filename,object_key,url,mime_type,size_bytes,checksum_sha256,status) VALUES($1,'', $2,$3,$4,$5,$6,$7,'active') RETURNING *`, [id,input.filename,key,url,input.mimeType,input.body.length,checksum]); await client.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,'media.upload','media_asset',$2::text,$3::jsonb)",[actorId,id,JSON.stringify({ filename: input.filename, mimeType: input.mimeType, sizeBytes: input.body.length })]); await client.query("COMMIT"); return map(result.rows[0]); } catch(error) { await client.query("ROLLBACK"); try { await cos.deleteObject(key); } catch { /* retain failure for operator cleanup */ } throw error; } finally { client.release(); }
    },
    async recycle(id: string, actorId: string) { const client=await pool.connect();try{await client.query('BEGIN');const result=await client.query<MediaRow>("SELECT * FROM media_assets WHERE id=$1 FOR UPDATE",[id]);if(!result.rows[0])throw new MediaError('媒体资源不存在','MEDIA_NOT_FOUND',404);const count=await references(client,id);if(count>0)throw new MediaError('资源仍被业务引用，不能删除','MEDIA_REFERENCED',409);await client.query("UPDATE media_assets SET status='recycled',recycled_at=now(),updated_at=now() WHERE id=$1",[id]);await client.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,'media.recycle','media_asset',$2::text,$3::jsonb)",[actorId,id,JSON.stringify({ references: count })]);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}},
    async restore(id: string, actorId: string) { const result=await pool.query<MediaRow>("UPDATE media_assets SET status='active',recycled_at=NULL,delete_error=NULL,updated_at=now() WHERE id=$1 AND status='recycled' RETURNING *",[id]);if(!result.rows[0])throw new MediaError('回收站资源不存在','MEDIA_NOT_FOUND',404);await pool.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,'media.restore','media_asset',$2::text,'{}'::jsonb)",[actorId,id]);return map(result.rows[0]);},
    async permanentDelete(id: string, actorId: string) { const client=await pool.connect();try{await client.query('BEGIN');const row=await client.query<MediaRow>("SELECT * FROM media_assets WHERE id=$1 AND status='recycled' AND recycled_at <= now()-interval '3 days' FOR UPDATE",[id]);if(!row.rows[0])throw new MediaError('资源未满足三天保留期','MEDIA_RETENTION',409);if(await references(client,id)>0)throw new MediaError('资源仍被业务引用，不能删除','MEDIA_REFERENCED',409);await client.query("UPDATE media_assets SET status='deleting',delete_attempts=delete_attempts+1,last_delete_attempt_at=now() WHERE id=$1",[id]);await client.query('COMMIT');try{await cos.deleteObject(row.rows[0].object_key);}catch{await pool.query("UPDATE media_assets SET status='recycled',delete_error=$2,updated_at=now() WHERE id=$1",[id,'COS delete failed']);throw new MediaError('COS 删除失败，已保留资源等待重试','MEDIA_DELETE_FAILED',502);}await pool.query("DELETE FROM media_assets WHERE id=$1",[id]);await pool.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,'media.delete','media_asset',$2::text,'{}'::jsonb)",[actorId,id]);}catch(e){try{await client.query('ROLLBACK')}catch{}throw e;}finally{client.release();}}
  };
}
export type MediaService=ReturnType<typeof createMediaService>;
