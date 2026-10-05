import { Router } from 'express';
import { z } from 'zod';
import { getProvince } from '../../src/data/zambia.js';
import { requireUser } from '../auth.js';
import { HttpError, newId, parse } from '../http.js';
import { notify, notifyShopOwner } from '../notify.js';
import { LIVE_SHOP, myShopOrFail } from '../queries.js';
import { CATEGORY_IDS } from '../schemas.js';

const REQUEST_DAYS = 30;

const requestSchema = z
  .object({
    title: z.string().trim().min(5, 'Say what you are looking for, e.g. 200 bags of cement').max(120),
    description: z.string().trim().max(2000).default(''),
    category: z.union([z.enum(CATEGORY_IDS), z.literal('')]).optional(),
    qty: z.coerce.number().int().min(1, 'How many do you need?').max(10_000_000),
    unit: z.string().trim().min(1).max(20).default('units'),
    budget: z.union([z.coerce.number().positive(), z.literal(''), z.null()]).optional(),
    province: z.string().refine((p) => getProvince(p), 'Choose a valid province'),
    town: z.string().min(1, 'Choose a town'),
  })
  .refine((v) => getProvince(v.province)?.towns.includes(v.town), 'That town is not in the selected province');

const offerSchema = z.object({
  price: z.coerce.number().positive('Enter your price per unit'),
  note: z.string().trim().max(1000).default(''),
  productId: z.string().max(40).optional().nullable(),
});

export const toRequest = (r) => ({
  id: r.id,
  title: r.title,
  description: r.description,
  category: r.category,
  qty: r.qty,
  unit: r.unit,
  budget: r.budget == null ? null : Number(r.budget),
  province: r.province,
  town: r.town,
  status: r.removed_at ? 'removed' : r.status === 'open' && new Date(r.expires_at) < new Date() ? 'expired' : r.status,
  removedReason: r.removed_reason ?? undefined,
  buyerName: r.buyer_name?.split(' ')[0],
  offerCount: r.offer_count ?? 0,
  acceptedOfferId: r.accepted_offer_id,
  date: r.created_at,
  expiresAt: r.expires_at,
});

const toOffer = (o) => ({
  id: o.id,
  shopId: o.shop_id,
  shopName: o.shop_name,
  shopTown: o.shop_town,
  shopVerified: o.verification === 'verified',
  price: Number(o.price),
  note: o.note,
  productId: o.product_id,
  date: o.created_at,
});

export const SELECT = `SELECT r.*, u.name AS buyer_name,
                       (SELECT count(*) FROM request_offers o WHERE o.request_id = r.id)::int AS offer_count
                  FROM buying_requests r JOIN users u ON u.id = r.buyer_id`;

// The buying requests board: buyers post what they need; approved shops send offers.
export function buyingRequestRoutes(db) {
  const router = Router();

  // Public board of open requests.
  router.get('/', async (req, res) => {
    const f = parse(
      z.object({ cat: z.string().max(30).optional(), prov: z.string().max(30).optional(), q: z.string().max(80).optional() }),
      req.query
    );
    const rows = await db.query(
      `${SELECT} WHERE r.status = 'open' AND r.expires_at > now()
          AND ($1::text IS NULL OR r.category = $1) AND ($2::text IS NULL OR r.province = $2)
          AND ($3::text IS NULL OR r.title ILIKE '%' || $3 || '%')
        ORDER BY r.created_at DESC LIMIT 100`,
      [f.cat || null, f.prov || null, f.q?.replace(/[\\%_]/g, '') || null]
    );
    res.json(rows.map(toRequest));
  });

  router.get('/mine', requireUser, async (req, res) => {
    const rows = await db.query(`${SELECT} WHERE r.buyer_id = $1 ORDER BY r.created_at DESC`, [req.user.id]);
    res.json(rows.map(toRequest));
  });

  // Details. The buyer sees every offer; a shop sees only its own; others see the request only.
  router.get('/:id', async (req, res) => {
    const [row] = await db.query(`${SELECT} WHERE r.id = $1`, [req.params.id]);
    if (!row) throw new HttpError(404, 'Request not found');
    const isBuyer = req.user?.id === row.buyer_id;
    if (row.removed_at && !isBuyer && !req.user?.isAdmin) throw new HttpError(404, 'Request not found');
    const offers = await db.query(
      `SELECT o.*, sh.name AS shop_name, sh.town AS shop_town, sh.verification FROM request_offers o
         JOIN shops sh ON sh.id = o.shop_id
        WHERE o.request_id = $1 AND ($2 OR o.shop_id = $3) ORDER BY o.price`,
      [row.id, isBuyer, req.user?.shopId ?? null]
    );
    res.json({ ...toRequest(row), mine: isBuyer, offers: offers.map(toOffer) });
  });

  router.post('/', requireUser, async (req, res) => {
    const b = parse(requestSchema, req.body);
    const id = newId('brq');
    await db.query(
      `INSERT INTO buying_requests (id, buyer_id, title, description, category, qty, unit, budget, province, town, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now() + make_interval(days => $11))`,
      [id, req.user.id, b.title, b.description, b.category || null, b.qty, b.unit, b.budget || null, b.province, b.town, REQUEST_DAYS]
    );
    const [row] = await db.query(`${SELECT} WHERE r.id = $1`, [id]);
    res.status(201).json(toRequest(row));
  });

  // An approved shop sends (or updates) its offer.
  router.post('/:id/offers', requireUser, async (req, res) => {
    const shop = await myShopOrFail(db, req.user);
    const [live] = await db.query(`SELECT 1 FROM shops sh WHERE sh.id = $1 AND ${LIVE_SHOP}`, [shop.id]);
    if (!live) throw new HttpError(403, 'Your shop must be approved before you can send offers');
    const [request] = await db.query('SELECT * FROM buying_requests WHERE id = $1', [req.params.id]);
    if (!request) throw new HttpError(404, 'Request not found');
    if (request.buyer_id === req.user.id) throw new HttpError(400, "You can't offer on your own request");
    if (request.status !== 'open' || new Date(request.expires_at) < new Date()) {
      throw new HttpError(409, 'This request is closed');
    }
    const b = parse(offerSchema, req.body);
    if (b.productId) {
      const [p] = await db.query('SELECT 1 FROM products WHERE id = $1 AND shop_id = $2 AND deleted_at IS NULL', [
        b.productId,
        shop.id,
      ]);
      if (!p) throw new HttpError(400, 'Link one of your own products');
    }
    await db.tx(async (t) => {
      await t.query(
        `INSERT INTO request_offers (id, request_id, shop_id, price, note, product_id) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (request_id, shop_id) DO UPDATE SET price = EXCLUDED.price, note = EXCLUDED.note,
                                                       product_id = EXCLUDED.product_id, created_at = now()`,
        [newId('ofr'), request.id, shop.id, b.price, b.note, b.productId || null]
      );
      await notify(t, request.buyer_id, {
        kind: 'offer',
        title: `New offer from ${shop.name}`,
        body: `K${b.price} per unit for “${request.title}”`,
        link: `/requests/${request.id}`,
      });
    });
    res.status(201).json({ ok: true });
  });

  // The buyer picks an offer; the request closes and the shop is told.
  router.patch('/:id/offers/:offerId/accept', requireUser, async (req, res) => {
    const [request] = await db.query('SELECT * FROM buying_requests WHERE id = $1 AND buyer_id = $2', [
      req.params.id,
      req.user.id,
    ]);
    if (!request) throw new HttpError(404, 'Request not found');
    if (request.status !== 'open') throw new HttpError(409, 'This request is already closed');
    const [offer] = await db.query('SELECT * FROM request_offers WHERE id = $1 AND request_id = $2', [
      req.params.offerId,
      request.id,
    ]);
    if (!offer) throw new HttpError(404, 'Offer not found');
    await db.tx(async (t) => {
      await t.query(`UPDATE buying_requests SET status = 'closed', accepted_offer_id = $2 WHERE id = $1`, [
        request.id,
        offer.id,
      ]);
      await notifyShopOwner(t, offer.shop_id, {
        kind: 'offer',
        title: 'Your offer was accepted',
        body: `${req.user.name.split(' ')[0]} accepted your offer for “${request.title}”. Message them to arrange the order.`,
        link: `/requests/${request.id}`,
      });
    });
    res.json({ ok: true });
  });

  router.patch('/:id/close', requireUser, async (req, res) => {
    const rows = await db.query(
      `UPDATE buying_requests SET status = 'closed' WHERE id = $1 AND buyer_id = $2 RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) throw new HttpError(404, 'Request not found');
    res.json({ ok: true });
  });

  return router;
}
