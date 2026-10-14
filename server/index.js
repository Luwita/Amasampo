import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { createDb, migrate } from './db.js';
import { loadDelivery } from './delivery.js';
import { smsFromEnv } from './sms.js';
import { startJobs } from './jobs.js';
import { backfillDemoProducts, seedIfEmpty } from './seed.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const production = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT) || 4000;

const dataDir = process.env.PGLITE_DIR ?? path.join(root, 'server', '.data', 'pg');
const db = await createDb({ dataDir });
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
const app = createApp(db, {
  sms,
  uploadDir: process.env.UPLOAD_DIR ?? path.join(root, 'server', '.data', 'uploads'),
  buildDir: path.join(root, 'build'),
  // Shows sign-in codes on the sign-in screen: on a development computer without an SMS provider, or anywhere
  // with SHOW_SIGNIN_CODES=1 (testing before SMS is paid for). Staff codes are never shown, only logged.
  exposeCodes: process.env.SHOW_SIGNIN_CODES === '1' || (!production && sms.provider === 'console'),
  // Staff accounts, e.g. ADMIN_PHONES=0977123456,0966123456
  adminPhones: (process.env.ADMIN_PHONES ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean),
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
