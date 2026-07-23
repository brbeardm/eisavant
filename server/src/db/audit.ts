import type pg from 'pg';

export async function logAudit(
  client: pg.PoolClient,
  entry: {
    actorUserId: string | null;
    action: string;
    targetUserId?: string | null;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO audit_log (actor_user_id, action, target_user_id, details)
     VALUES ($1, $2, $3, $4)`,
    [entry.actorUserId, entry.action, entry.targetUserId ?? null, JSON.stringify(entry.details ?? {})],
  );
}
