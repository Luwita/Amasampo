// Removes every shop and product, and everything that depends on them (orders, reviews, chats, returns,
// payouts…), so the marketplace starts empty. User accounts, staff, support questions, buying requests,
// banners and settings are kept.
//
//   npm run reset:catalog -- --yes
//
// Stop `npm run dev` first: the local database can only be opened by one program at a time.
// With the local database (no DATABASE_URL) a copy is saved to server/.data/pg-backup-<time> first.
import { cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb, migrate } from '../server/db.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

if (!args.includes('--yes')) {
  console.log('This deletes ALL shops, products and orders. Run again with --yes to confirm:');
  console.log('  npm run reset:catalog -- --yes');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production' && !args.includes('--production')) {
  console.log('Refusing to run with NODE_ENV=production. Add --production if you really mean it.');
  process.exit(1);
}

const dataDir = process.env.PGLITE_DIR ?? path.join(root, 'server', '.data', 'pg');
if (!process.env.DATABASE_URL && existsSync(dataDir)) {
  const backup = `${dataDir}-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  await cp(dataDir, backup, { recursive: true });
  console.log(`Backup saved to ${backup}`);
}

const db = await createDb({ dataDir });
await migrate(db);

const count = async (table) => (await db.query(`SELECT count(*)::int AS n FROM ${table}`))[0].n;
const before = { shops: await count('shops'), products: await count('products'), orders: await count('orders') };

await db.tx(async (t) => {
  // Things that point at orders, shops or products, children first.
  await t.query('DELETE FROM request_offers');
  await t.query('UPDATE buying_requests SET accepted_offer_id = NULL');
  await t.query('DELETE FROM messages');
  await t.query('DELETE FROM conversations');
  await t.query('DELETE FROM refunds');
  await t.query('DELETE FROM cases');
  await t.query('DELETE FROM reviews');
  await t.query('DELETE FROM order_items');
  await t.query('DELETE FROM price_requests');
  await t.query('DELETE FROM shipments');
  // Vouchers spent on deleted orders become usable again.
  await t.query('UPDATE orders SET voucher_id = NULL');
  await t.query('UPDATE vouchers SET used_order_id = NULL');
  await t.query('DELETE FROM orders');
  await t.query('DELETE FROM coupons');
  await t.query('DELETE FROM payouts');
  await t.query('UPDATE products SET source_product_id = NULL');
  await t.query('DELETE FROM products');
  await t.query('DELETE FROM shops');
  // Notifications about orders, shops and listings would now lead nowhere.
  await t.query(`DELETE FROM notifications WHERE kind NOT IN ('support', 'voucher', 'announcement')`);
  // Shop owners keep their accounts and are asked to set up their shop again.
});

console.log(
  `Removed ${before.shops} shops, ${before.products} products and ${before.orders} orders. ` +
    'Users, staff and settings are kept.',
);
await db.close();
