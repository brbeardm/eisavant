import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.appDatabaseUrl,
  max: 10,
  // Railway's public proxy and the internal network both present certs the
  // node client can't chain; TLS is still used, verification is relaxed.
  ssl: config.appDatabaseUrl.includes('railway') ? { rejectUnauthorized: false } : undefined,
});

export interface SessionContext {
  userId: string | null; // null for unauthenticated (registration, public pages)
  role: 'anon' | 'ceo' | 'support' | 'admin' | 'client';
  companyId?: string | null; // client-role users only
}

export const ANON: SessionContext = { userId: null, role: 'anon' };

/** Re-binds identity mid-transaction (used once: registration switches from
 *  anon to the newly created user so profile/document inserts pass RLS). */
export async function setContext(client: pg.PoolClient, ctx: SessionContext): Promise<void> {
  await client.query(
    `SELECT set_config('app.user_id', $1, true), set_config('app.role', $2, true),
            set_config('app.company_id', $3, true)`,
    [ctx.userId ?? '', ctx.role, ctx.companyId ?? ''],
  );
}

/**
 * Runs `fn` inside a transaction with the caller's identity bound to the
 * Postgres session via set_config(). Every RLS policy reads these two
 * settings — no query in the app may touch the database outside this helper.
 */
export async function withContext<T>(
  ctx: SessionContext,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setContext(client, ctx);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
