import { Router } from 'express';
import { z } from 'zod';
import { FEATURED_DAYS, FEATURED_LIMIT } from '../../src/data/fees.js';
import { requireUser } from '../auth.js';
import { HttpError, newId, parse } from '../http.js';
import { toProduct } from '../mappers.js';
import { myShopOrFail } from '../queries.js';
import { couponSchema } from '../schemas.js';

const toCoupon = (row) => ({
  id: row.id,
  code: row.code,
  kind: row.kind,
  value: Number(row.value),
  minSpend: Number(row.min_spend),
  maxUses: row.max_uses,
  uses: row.uses,
  endsAt: row.ends_at,
  active: row.active,
  expired: !!row.ends_at && new Date(row.ends_at) < new Date(),
});

// Discount codes and featured listings, managed by the shop owner.
export function promotionRoutes(db) {
  const router = Router();

  router.get('/seller/coupons', requireUser, async (req, res) => {
    const shop = await myShopOrFail(db, req.user);
    const rows = await db.query('SELECT * FROM coupons WHERE shop_id = $1 ORDER BY created_at DESC', [shop.id]);
    res.json(rows.map(toCoupon));
  });

  router.post('/seller/coupons', requireUser, async (req, res) => {
    const shop = await myShopOrFail(db, req.user);
    const c = parse(couponSchema, req.body);
    const rows = await db.query(
      `INSERT INTO coupons (id, shop_id, code, kind, value, min_spend, max_uses, ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (shop_id, code) DO NOTHING RETURNING *`,
      [
        newId('cpn'),
        shop.id,
        c.code,
        c.kind,
        c.value,
        c.minSpend,
        c.maxUses || null,
        // A code is valid until the end of its last day (Zambia is UTC+2).
        c.endsAt ? `${c.endsAt}T23:59:59+02:00` : null,
      ],
    );
    if (!rows.length) throw new HttpError(409, `You already have a code called ${c.code}`);
    res.status(201).json(toCoupon(rows[0]));
  });

  router.patch('/seller/coupons/:id', requireUser, async (req, res) => {
    const shop = await myShopOrFail(db, req.user);
    const { active } = parse(z.object({ active: z.boolean() }), req.body);
    const [row] = await db.query('UPDATE coupons SET active = $3 WHERE id = $1 AND shop_id = $2 RETURNING *', [
      req.params.id,
      shop.id,
      active,
    ]);
    if (!row) throw new HttpError(404, 'Code not found');
    res.json(toCoupon(row));
  });

  // Feature a product on the home page for FEATURED_DAYS days (free during launch, FEATURED_LIMIT at a time).
  router.post('/products/:id/feature', requireUser, async (req, res) => {
    const shop = await myShopOrFail(db, req.user);
    const product = await db.tx(async (t) => {
      // Lock the shop row so two quick clicks can't both pass the limit check.
      await t.query('SELECT id FROM shops WHERE id = $1 FOR UPDATE', [shop.id]);
      const active = await t.query(
        'SELECT id FROM products WHERE shop_id = $1 AND featured_until > now() AND deleted_at IS NULL',
        [shop.id],
      );
      if (active.length >= FEATURED_LIMIT && !active.some((p) => p.id === req.params.id)) {
        throw new HttpError(409, `You can feature up to ${FEATURED_LIMIT} products at a time`);
      }
      const [row] = await t.query(
        `UPDATE products SET featured_until = now() + make_interval(days => $3)
          WHERE id = $1 AND shop_id = $2 AND deleted_at IS NULL RETURNING *`,
        [req.params.id, shop.id, FEATURED_DAYS],
      );
      if (!row) throw new HttpError(404, 'Product not found in your shop');
      return row;
    });
    res.json(toProduct(product));
  });

  router.delete('/products/:id/feature', requireUser, async (req, res) => {
    const shop = await myShopOrFail(db, req.user);
    const [row] = await db.query(
      'UPDATE products SET featured_until = NULL WHERE id = $1 AND shop_id = $2 RETURNING *',
      [req.params.id, shop.id],
    );
    if (!row) throw new HttpError(404, 'Product not found in your shop');
    res.json(toProduct(row));
  });

  return router;
}
