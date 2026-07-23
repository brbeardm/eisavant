/**
 * Migration runner. Connects with the OWNER credentials (DATABASE_URL), which
 * is the only part of the system allowed to do so. Responsibilities:
 *   1. Ensure the non-privileged application role `eisavant_app` exists
 *      (LOGIN, NOBYPASSRLS) with the password from APP_DB_PASSWORD.
 *   2. Apply every .sql file in ./migrations (sorted) exactly once, tracked
 *      in schema_migrations, each inside a transaction.
 *
 * Usage: npm run migrate  (requires DATABASE_URL and APP_DB_PASSWORD)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const adminUrl = process.env.DATABASE_URL;
const appPassword = process.env.APP_DB_PASSWORD;
if (!adminUrl) throw new Error('DATABASE_URL is required');
if (!appPassword) throw new Error('APP_DB_PASSWORD is required');

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

const client = new pg.Client({
  connectionString: adminUrl,
  ssl: adminUrl.includes('railway') ? { rejectUnauthorized: false } : undefined,
});

async function main() {
  await client.connect();

  // 1. Application role. Password comes from env; identifier is fixed.
  const { rows: roleRows } = await client.query(
    `SELECT 1 FROM pg_roles WHERE rolname = 'eisavant_app'`,
  );
  const escapedPassword = appPassword!.replace(/'/g, "''");
  if (roleRows.length === 0) {
    await client.query(
      `CREATE ROLE eisavant_app LOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${escapedPassword}'`,
    );
    console.log('Created role eisavant_app (LOGIN, NOBYPASSRLS)');
  } else {
    await client.query(`ALTER ROLE eisavant_app WITH PASSWORD '${escapedPassword}'`);
    console.log('Role eisavant_app already exists; password synced');
  }

  // 2. Tracked migrations.
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set(
    (await client.query('SELECT filename FROM schema_migrations')).rows.map((r) => r.filename),
  );

  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip  ${file}`);
      continue;
    }
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    console.log(`apply ${file}`);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    }
  }
  console.log('Migrations complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => client.end());
