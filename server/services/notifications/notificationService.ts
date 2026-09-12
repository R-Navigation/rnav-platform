import type { Pool, PoolClient } from "pg";

export type NotificationEvent = { eventKey: string; type: string; title: string; message?: string; href?: string; userIds: string[] };

export async function insertNotifications(client: Pick<PoolClient, "query">, event: NotificationEvent) {
  const userIds = [...new Set(event.userIds)].filter(Boolean);
  if (!userIds.length) return;
  await client.query(`INSERT INTO notifications(user_id,event_key,type,title,message,href)
    SELECT user_id,$2,$3,$4,$5,$6 FROM unnest($1::uuid[]) user_id
    ON CONFLICT(user_id,event_key) DO NOTHING`, [userIds, event.eventKey, event.type, event.title, event.message ?? "", event.href ?? ""]);
}

export function createNotificationService(pool: Pick<Pool, "query">) {
  return {
    async list(userId: string, limit = 30) {
      const result = await pool.query<any>(`SELECT id,type,title,message,href,read_at,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`, [userId, limit]);
      const unread = await pool.query<{ count: string }>("SELECT count(*)::text count FROM notifications WHERE user_id=$1 AND read_at IS NULL", [userId]);
      return { unreadCount: Number(unread.rows[0]?.count ?? 0), notifications: result.rows.map((row: any) => ({ id: row.id, type: row.type, title: row.title, message: row.message, href: row.href, readAt: row.read_at, createdAt: row.created_at })) };
    },
    async markRead(userId: string, id: string) { await pool.query("UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2", [id, userId]); },
    async markAllRead(userId: string) { await pool.query("UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL", [userId]); },
  };
}
export type NotificationService = ReturnType<typeof createNotificationService>;

