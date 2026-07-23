/**
 * Seeds the initial admin account. Runs with OWNER credentials (DATABASE_URL)
 * because bootstrap happens before any admin exists to authorize it.
 *
 * Usage: SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... npm run seed
 */
import bcrypt from 'bcryptjs';
import pg from 'pg';

const adminUrl = process.env.DATABASE_URL;
const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;
if (!adminUrl) throw new Error('DATABASE_URL is required');
if (!email || !password) throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required');
if (password.length < 12) throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters');

const client = new pg.Client({
  connectionString: adminUrl,
  ssl: adminUrl.includes('railway') ? { rejectUnauthorized: false } : undefined,
});

async function main() {
  await client.connect();
  const hash = await bcrypt.hash(password!, 12);
  const { rows } = await client.query(
    `INSERT INTO users (email, password_hash, role, status)
     VALUES ($1, $2, 'admin', 'active')
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [email, hash],
  );
  if (rows.length === 0) {
    console.log(`Admin ${email} already exists — nothing to do.`);
    return;
  }
  await client.query(
    `INSERT INTO profiles (user_id, first_name, last_name, title)
     VALUES ($1, 'Platform', 'Administrator', 'Administrator')`,
    [rows[0].id],
  );
  console.log(`Created admin account ${email} (${rows[0].id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => client.end());
