import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { cleanDatabaseUrl, createDb, migrate } from './db.js';
import { loadDelivery } from './delivery.js';
import { smsFromEnv } from './sms.js';
import { startJobs } from './jobs.js';
import { backfillDemoProducts, seedIfEmpty } from './seed.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const production = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT) || 4000;

const dataDir = process.env.PGLITE_DIR ?? path.join(root, 'server', '.data', 'pg');
// The built-in database is for development only: on a host it would lose data on every restart and needs more
// memory than small plans have. So production never starts without a real Postgres database.
if (production && !cleanDatabaseUrl(process.env.DATABASE_URL)) {
  console.error('DATABASE_URL is not set. Add the Neon connection string (postgresql://...) to the server settings.');
  process.exit(1);
}
const db = await createDb({ dataDir });
if (db.kind === 'postgres') {
  console.log(`Database: Postgres at ${new URL(cleanDatabaseUrl(process.env.DATABASE_URL)).hostname}`);
}
// Neon: the app's queries go through the pooled address (DATABASE_URL); database updates use the direct one
// (DATABASE_URL_UNPOOLED), because the pooler doesn't keep a session open between statements.
let applied;
if (db.kind === 'postgres' && process.env.DATABASE_URL_UNPOOLED) {
  const direct = await createDb({ url: process.env.DATABASE_URL_UNPOOLED });
  try {
    applied = await migrate(direct);
  } finally {
    await direct.close();
  }
} else {
  applied = await migrate(db);
}
if (applied.length) console.log(`Database updated: ${applied.join(', ')}`);
await loadDelivery(db);
// Demo shops and products load only when SEED_DEMO=1. Without it the marketplace starts empty and every shop
// is added by its owner and approved by staff.
if (process.env.SEED_DEMO === '1') {
  if (await seedIfEmpty(db)) console.log('Seeded demo shops and products');
  else if (applied.includes('002_phase2.sql')) await backfillDemoProducts(db);
}

const sms = smsFromEnv();
// Neon Auth runs sign-up and sign-in. Its URL comes from `neon env pull` locally and the host's settings live.
const authUrl = process.env.NEON_AUTH_BASE_URL?.trim();
const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET?.trim();
if (production && (!authUrl || !cookieSecret || cookieSecret.length < 32)) {
  console.error(
    'Sign-in needs NEON_AUTH_BASE_URL (the branch Neon Auth URL) and NEON_AUTH_COOKIE_SECRET (32+ random characters).',
  );
  process.exit(1);
}
if (!authUrl) console.warn('[auth] NEON_AUTH_BASE_URL is not set: nobody can sign in. Run `neon env pull`.');
const list = (v) =>
  (v ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
const app = createApp(db, {
  sms,
  uploadDir: process.env.UPLOAD_DIR ?? path.join(root, 'server', '.data', 'uploads'),
  buildDir: path.join(root, 'build'),
  // Shows sign-in codes on the sign-in screen: on a development computer without an SMS provider, or anywhere
  // with SHOW_SIGNIN_CODES=1 (testing before SMS is paid for). Staff codes are never shown, only logged.
  exposeCodes: process.env.SHOW_SIGNIN_CODES === '1' || (!production && sms.provider === 'console'),
  // Owners, by verified phone number or email address, e.g. ADMIN_PHONES=0977123456 ADMIN_EMAILS=me@example.com
  adminPhones: list(process.env.ADMIN_PHONES),
  adminEmails: list(process.env.ADMIN_EMAILS),
  production,
  auth: { baseUrl: authUrl, cookieSecret: cookieSecret || undefined },
});

// Reminds buyers to pay and cancels Mobile Money orders nobody paid for.
startJobs(db);

if (process.env.SHOW_SIGNIN_CODES === '1') {
  console.warn('[auth] SHOW_SIGNIN_CODES is on: sign-in codes appear on screen. Remove it before real customers use the site.');
}

app.listen(port, () =>
  console.log(
    `Zed Market API on http://localhost:${port} (database: ${db.kind}${db.location ? ` in ${db.location}` : ''}; SMS: ${sms.provider})`,
  ),
);
