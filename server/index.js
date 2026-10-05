import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { createDb, migrate } from './db.js';
import { backfillDemoProducts, seedIfEmpty } from './seed.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const production = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT) || 4000;

const db = await createDb({ dataDir: process.env.PGLITE_DIR ?? path.join(root, 'server', '.data', 'pg') });
const applied = await migrate(db);
// Demo shops and products are for development; in production they load only when SEED_DEMO=1.
if (!production || process.env.SEED_DEMO === '1') {
  if (await seedIfEmpty(db)) console.log('Seeded demo shops and products');
  else if (applied.includes('002_phase2.sql')) await backfillDemoProducts(db);
}

const app = createApp(db, {
  uploadDir: process.env.UPLOAD_DIR ?? path.join(root, 'server', '.data', 'uploads'),
  buildDir: path.join(root, 'build'),
  // Shows sign-in codes in the app while no SMS provider is connected. Never enabled in production.
  exposeCodes: !production,
  // Staff accounts, e.g. ADMIN_PHONES=0977123456,0966123456
  adminPhones: (process.env.ADMIN_PHONES ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean),
});

app.listen(port, () =>
  console.log(
    `Zed Market API on http://localhost:${port} (database: ${db.kind}${db.location ? ` in ${db.location}` : ''})`,
  ),
);
