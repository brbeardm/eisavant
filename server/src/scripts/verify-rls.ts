/**
 * Row-level security verification harness.
 *
 * Connects as the application role (APP_DATABASE_URL) and asserts that the
 * policies in 001_init.sql actually enforce the security model:
 * creates two throwaway CEO accounts, attempts legitimate and illegitimate
 * access under each role, then cleans up.
 *
 * Usage: npx tsx src/scripts/verify-rls.ts
 */
import pg from 'pg';

const url = process.env.APP_DATABASE_URL;
if (!url) throw new Error('APP_DATABASE_URL is required');

const pool = new pg.Pool({
  connectionString: url,
  max: 2,
  ssl: url.includes('railway') ? { rejectUnauthorized: false } : undefined,
});

type Ctx = { userId: string | null; role: string };

async function withCtx<T>(ctx: Ctx, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT set_config('app.user_id', $1, true), set_config('app.role', $2, true)`,
      [ctx.userId ?? '', ctx.role],
    );
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

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${name} ${detail}`);
  }
}

async function expectDenied(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(name, false, '(operation unexpectedly succeeded)');
  } catch {
    check(name, true);
  }
}

async function main() {
  const anon: Ctx = { userId: null, role: 'anon' };
  const stamp = Date.now();

  console.log('\n— anon (public) —');
  const anonUsers = await withCtx(anon, (c) => c.query('SELECT * FROM users'));
  check('anon sees zero user rows', anonUsers.rowCount === 0);
  const anonTestimonials = await withCtx(anon, (c) => c.query('SELECT * FROM testimonials'));
  check('anon sees published testimonials', (anonTestimonials.rowCount ?? 0) > 0);
  await expectDenied('anon cannot read audit_log', () =>
    withCtx(anon, async (c) => {
      const r = await c.query('SELECT * FROM audit_log');
      if (r.rowCount === 0) throw new Error('empty (treated as denied)');
    }),
  );

  // Registration path: anon may only insert a pending CEO.
  const mk = (n: string) =>
    withCtx(anon, async (c) => {
      // id generated app-side: anon has no SELECT policy, so RETURNING would
      // be rejected (SELECT policies apply to RETURNING rows).
      const id = crypto.randomUUID();
      await c.query(
        `INSERT INTO users (id, email, password_hash, role, status)
         VALUES ($1, $2, 'x', 'ceo', 'pending_payment')`,
        [id, `rls-test-${n}-${stamp}@example.com`],
      );
      await c.query(
        `SELECT set_config('app.user_id', $1, true), set_config('app.role', 'ceo', true)`,
        [id],
      );
      await c.query(
        `INSERT INTO profiles (user_id, first_name, last_name) VALUES ($1, $2, 'Test')`,
        [id, n],
      );
      return id;
    });
  const alice = await mk('alice');
  const bob = await mk('bob');
  check('anon can register (insert pending ceo)', Boolean(alice && bob));
  await expectDenied('anon cannot insert an admin user', () =>
    withCtx(anon, (c) =>
      c.query(
        `INSERT INTO users (email, password_hash, role, status)
         VALUES ($1, 'x', 'admin', 'active')`,
        [`rls-test-evil-${stamp}@example.com`],
      ),
    ),
  );

  console.log('\n— ceo (member) —');
  const aliceCtx: Ctx = { userId: alice, role: 'ceo' };
  const visible = await withCtx(aliceCtx, (c) => c.query('SELECT id FROM users'));
  check('ceo sees only their own user row', visible.rowCount === 1 && visible.rows[0].id === alice);
  const bobProfile = await withCtx(aliceCtx, (c) =>
    c.query('SELECT * FROM profiles WHERE user_id = $1', [bob]),
  );
  check("ceo cannot read another member's profile", bobProfile.rowCount === 0);
  const crossUpdate = await withCtx(aliceCtx, (c) =>
    c.query(`UPDATE profiles SET bio = 'hacked' WHERE user_id = $1`, [bob]),
  );
  check("ceo cannot update another member's profile (0 rows)", crossUpdate.rowCount === 0);
  await expectDenied('ceo cannot self-escalate to admin (guard trigger)', () =>
    withCtx(aliceCtx, (c) => c.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [alice])),
  );
  const ownUpdate = await withCtx(aliceCtx, (c) =>
    c.query(`UPDATE profiles SET bio = 'my own bio' WHERE user_id = $1`, [alice]),
  );
  check('ceo can update their own profile', crossUpdate.rowCount === 0 && ownUpdate.rowCount === 1);
  await expectDenied('ceo cannot read support notes', () =>
    withCtx(aliceCtx, async (c) => {
      const r = await c.query('SELECT * FROM support_notes');
      if (r.rowCount === 0) throw new Error('empty (treated as denied)');
    }),
  );

  console.log('\n— support —');
  const supportCtx: Ctx = { userId: alice, role: 'support' }; // identity irrelevant; role drives policy
  const supportView = await withCtx(supportCtx, (c) =>
    c.query('SELECT id FROM users WHERE id = ANY($1)', [[alice, bob]]),
  );
  check('support can see all members', supportView.rowCount === 2);
  // RLS hides other users' rows from support for UPDATE, so the statement
  // "succeeds" but touches 0 rows — that is the denial.
  await expectDenied('support cannot change a role (0 rows)', () =>
    withCtx(supportCtx, async (c) => {
      const r = await c.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [bob]);
      if (r.rowCount === 0) throw new Error('0 rows (treated as denied)');
    }),
  );
  await expectDenied('support cannot delete users', () =>
    withCtx(supportCtx, async (c) => {
      const r = await c.query('DELETE FROM users WHERE id = $1', [bob]);
      if (r.rowCount === 0) throw new Error('0 rows (treated as denied)');
    }),
  );

  console.log('\n— admin —');
  const adminCtx: Ctx = { userId: alice, role: 'admin' };
  const audit = await withCtx(adminCtx, (c) => c.query('SELECT count(*) FROM audit_log'));
  check('admin can read audit_log', audit.rowCount === 1);
  const cleanup = await withCtx(adminCtx, (c) =>
    c.query('DELETE FROM users WHERE id = ANY($1)', [[alice, bob]]),
  );
  check('admin can delete users (cleanup)', cleanup.rowCount === 2);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
