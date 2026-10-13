import { seedProducts } from '../src/data/catalog.js';
import { seedShops } from '../src/data/shops.js';
import { normalizePhone } from '../src/utils/format.js';

// Fills an empty database with the demo shops and products.
export async function seedIfEmpty(db) {
  const [{ count }] = await db.query('SELECT count(*)::int AS count FROM shops');
  if (count > 0) return false;

  await db.tx(async (t) => {
    for (const s of seedShops) {
      await t.query(
        // Demo shops are created already approved, so the marketplace isn't empty.
        `INSERT INTO shops (id, name, logo, province, town, area, phone, couriers, rating, since, verification,
                            momo_network, momo_number, momo_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'verified', $11, $12, $13)`,
        [
          s.id,
          s.name,
          s.logo,
          s.province,
          s.town,
          s.area,
          s.phone,
          JSON.stringify(s.couriers),
          s.rating,
          s.since,
          // Demo shops take Mobile Money on their shop phone.
          { 6: 'mtn', 7: 'airtel', 5: 'zamtel' }[normalizePhone(s.phone)[1]] ?? 'mtn',
          normalizePhone(s.phone),
          s.name,
        ],
      );
    }
    for (const p of seedProducts) {
      await t.query(
        `INSERT INTO products (id, shop_id, name, category, icon, description, price, old_price, tiers, stock, sold, rating, badge, local,
                               weight_kg, options)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          p.id,
          p.shopId,
          p.name,
          p.category,
          p.icon,
          p.description,
          p.price,
          p.oldPrice,
          JSON.stringify(p.tiers),
          p.stock,
          p.sold,
          p.rating,
          p.badge,
          p.local,
          p.weightKg,
          JSON.stringify(p.options),
        ],
      );
    }
  });
  return true;
}

// Databases seeded before weights and options existed get the demo values once, when migration 002 runs.
export async function backfillDemoProducts(db) {
  for (const p of seedProducts) {
    await db.query(
      `UPDATE products SET weight_kg = $2, options = $3 WHERE id = $1 AND weight_kg = 1 AND options = '[]'::jsonb`,
      [p.id, p.weightKg, JSON.stringify(p.options)],
    );
  }
}
