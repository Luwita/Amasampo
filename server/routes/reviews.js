import { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { HttpError, newId, parse } from '../http.js';
import { toReview } from '../mappers.js';
import { myShopOrFail, refreshRatings } from '../queries.js';
import { reviewSchema } from '../schemas.js';

const PAGE = 10;

export function reviewRoutes(db) {
  const router = Router();

  // Reviews for a product, newest first, with the star breakdown.
  router.get('/products/:id/reviews', async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const items = await db.query(
      `SELECT * FROM reviews WHERE product_id = $1 ORDER BY created_at DESC LIMIT ${PAGE} OFFSET $2`,
      [req.params.id, (page - 1) * PAGE],
    );
    const counts = await db.query(
      'SELECT rating, count(*)::int AS n FROM reviews WHERE product_id = $1 GROUP BY rating',
      [req.params.id],
    );
    const histogram = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    counts.forEach((c) => (histogram[c.rating] = c.n));
    const count = counts.reduce((n, c) => n + c.n, 0);
    const average = count ? Math.round((counts.reduce((s, c) => s + c.rating * c.n, 0) / count) * 10) / 10 : 0;
    res.json({ items: items.map(toReview), count, average, histogram, page, pageSize: PAGE });
  });

  router.get('/shops/:id/reviews', async (req, res) => {
    const rows = await db.query(
      `SELECT r.*, p.name AS product_name FROM reviews r JOIN products p ON p.id = r.product_id
        WHERE r.shop_id = $1 ORDER BY r.created_at DESC LIMIT 20`,
      [req.params.id],
    );
    res.json(rows.map(toReview));
  });

  // Only buyers whose parcel containing the product was delivered may review it, once per order.
  router.post('/reviews', requireUser, async (req, res) => {
    const body = parse(reviewSchema, req.body);
    const [eligible] = await db.query(
      `SELECT s.shop_id, s.status FROM orders o
         JOIN shipments s ON s.order_id = o.id
         JOIN order_items i ON i.shipment_id = s.id
        WHERE o.id = $1 AND o.buyer_id = $2 AND i.product_id = $3
        LIMIT 1`,
      [body.orderId, req.user.id, body.productId],
    );
    if (!eligible) throw new HttpError(403, 'You can only review products you bought');
    if (eligible.status !== 'delivered') throw new HttpError(409, 'You can review this once it has been delivered');

    const review = await db.tx(async (t) => {
      const [row] = await t.query(
        `INSERT INTO reviews (id, product_id, shop_id, order_id, user_id, author_name, rating, comment)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (order_id, product_id) DO NOTHING RETURNING *`,
        [
          newId('rev'),
          body.productId,
          eligible.shop_id,
          body.orderId,
          req.user.id,
          req.user.name,
          body.rating,
          body.comment,
        ],
      );
      if (!row) throw new HttpError(409, 'You already reviewed this item');
      await refreshRatings(t, body.productId, eligible.shop_id);
      return row;
    });
    res.status(201).json(toReview(review));
  });

  // The shop owner can answer a review publicly.
  router.patch('/reviews/:id/reply', requireUser, async (req, res) => {
    const shop = await myShopOrFail(db, req.user);
    const { reply } = parse(z.object({ reply: z.string().trim().min(1, 'Write a reply').max(1000) }), req.body);
    const [row] = await db.query(
      `UPDATE reviews SET reply = $3, replied_at = now() WHERE id = $1 AND shop_id = $2 RETURNING *`,
      [req.params.id, shop.id, reply],
    );
    if (!row) throw new HttpError(404, 'Review not found for your shop');
    res.json(toReview(row));
  });

  return router;
}
