import { Router } from 'express';
import { z } from 'zod';
import { round2 } from '../../src/data/fees.js';
import { getSettings } from '../settings.js';
import { bannerThemes } from '../../src/data/bannerThemes.js';
import { getProvince } from '../../src/data/zambia.js';
import { requireAdmin } from '../auth.js';
import { HttpError, newId, parse } from '../http.js';
import { notify, notifyShopOwner } from '../notify.js';
import { shopBalances, toPayout } from '../payouts.js';
import { logAdmin } from '../queries.js';
import { normalizePhone } from '../../src/utils/format.js';
import { SELECT as REQUEST_SELECT, toRequest } from './buyingRequests.js';

// Zambian local date of a timestamp column (Zambia is UTC+2 all year).
const localDay = (col) => `((${col} AT TIME ZONE 'UTC') + interval '2 hours')::date`;
const reason = z.string().trim().min(3, 'Give a reason; it is kept in the log').max(500);
const province = z.string().refine((p) => getProvince(p), 'Choose a province');
// Banner links stay inside Zed Market.
const internalLink = z
  .string()
  .trim()
  .regex(/^\/[\w\-/?=&%.]*$/, 'Use a Zed Market link like /shop?cat=solar');
const BANNER_THEMES = Object.keys(bannerThemes);

const bannerSchema = z.object({
  title: z.string().trim().min(3, 'Give the banner a title').max(60),
  text: z.string().trim().max(160).default(''),
  cta: z.string().trim().min(2).max(30).default('Shop now'),
  link: internalLink,
  image: z.union([z.string().regex(/^\/uploads\/[\w.-]+$/), z.literal(''), z.null()]).optional(),
  theme: z.enum(BANNER_THEMES).default('orange'),
  position: z.coerce.number().int().min(0).max(99).default(0),
  startsAt: z.coerce.date().optional().nullable(),
  endsAt: z.coerce.date().optional().nullable(),
  active: z.boolean().default(true),
});

const toBanner = (b) => ({
  id: b.id,
  title: b.title,
  text: b.text,
  cta: b.cta,
  link: b.link,
  image: b.image,
  theme: b.theme,
  position: b.position,
  startsAt: b.starts_at,
  endsAt: b.ends_at,
  active: b.active,
  live: b.active && new Date(b.starts_at) <= new Date() && (!b.ends_at || new Date(b.ends_at) > new Date()),
});

// Who an announcement or voucher campaign goes to.
function audienceSql(audience) {
  switch (audience) {
    case 'buyers':
      return `u.account_type IN ('buyer', 'business')`;
    case 'sellers':
      return `EXISTS (SELECT 1 FROM shops sh WHERE sh.owner_id = u.id)`;
    case 'province':
      return `u.id IN (SELECT o.buyer_id FROM orders o WHERE o.province = $1
                        UNION SELECT sh.owner_id FROM shops sh WHERE sh.province = $1 AND sh.owner_id IS NOT NULL)`;
    case 'phone':
      return `u.phone = $1`;
    default:
      return 'true';
  }
}
const ACTIVE_USER = 'u.deleted_at IS NULL AND u.suspended_at IS NULL';

// Public: banners shown on the home page now.
export function bannerRoutes(db) {
  const router = Router();
  router.get('/', async (_req, res) => {
    const rows = await db.query(
      `SELECT * FROM banners WHERE active AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
        ORDER BY position, created_at DESC LIMIT 6`,
    );
    res.json(rows.map(toBanner));
  });
  return router;
}

export function adminToolRoutes(db) {
  const router = Router();
  router.use(requireAdmin);

  // ----- Analytics -----
  router.get('/analytics', async (req, res) => {
    const { days } = parse(z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }), req.query);
    const since = `now() - make_interval(days => $1)`;
    // Value of each parcel that was not cancelled: what the buyer pays, plus the voucher Zed Market covers.
    const value = `(s.subtotal - s.discount + s.fee)`;

    const [totals] = await db.query(
      `SELECT count(DISTINCT o.id)::int AS orders, count(DISTINCT o.buyer_id)::int AS buyers,
              COALESCE(sum(${value}) FILTER (WHERE s.status <> 'cancelled'), 0) AS gmv,
              COALESCE(sum(s.voucher_discount) FILTER (WHERE s.status <> 'cancelled'), 0) AS vouchers,
              count(s.id)::int AS parcels,
              count(s.id) FILTER (WHERE s.status = 'cancelled')::int AS cancelled,
              count(s.id) FILTER (WHERE s.status = 'delivered')::int AS delivered
         FROM orders o JOIN shipments s ON s.order_id = o.id
        WHERE o.created_at > ${since}`,
      [days],
    );
    const [earned] = await db.query(
      `SELECT COALESCE(sum((s.subtotal - s.discount) * s.commission_rate), 0) AS commission FROM shipments s
        WHERE s.status = 'delivered' AND s.delivered_at > ${since}`,
      [days],
    );
    const [growth] = await db.query(
      `SELECT (SELECT count(*) FROM users WHERE created_at > ${since})::int AS new_users,
              (SELECT count(*) FROM shops WHERE created_at > ${since})::int AS new_shops,
              (SELECT COALESCE(sum(amount), 0) FROM refunds WHERE created_at > ${since}) AS refunds`,
      [days],
    );
    const daily = await db.query(
      `SELECT d::date AS day,
              (SELECT count(*) FROM orders o WHERE ${localDay('o.created_at')} = d::date)::int AS orders,
              (SELECT COALESCE(sum(${value}), 0) FROM shipments s JOIN orders o ON o.id = s.order_id
                WHERE s.status <> 'cancelled' AND ${localDay('o.created_at')} = d::date) AS gmv,
              (SELECT count(*) FROM users u WHERE ${localDay('u.created_at')} = d::date)::int AS users
         FROM generate_series(${localDay('now()')} - ($1 - 1), ${localDay('now()')}, interval '1 day') AS d
        ORDER BY d`,
      [days],
    );
    const group = (sql) => db.query(sql, [days]);
    const [provinces, shops, categories, payments, couriers] = await Promise.all([
      group(`SELECT o.province AS key, count(DISTINCT o.id)::int AS orders, COALESCE(sum(${value}), 0) AS gmv
               FROM orders o JOIN shipments s ON s.order_id = o.id
              WHERE o.created_at > ${since} AND s.status <> 'cancelled' GROUP BY o.province ORDER BY gmv DESC`),
      group(`SELECT sh.id AS key, sh.name, sh.town, count(*)::int AS orders, COALESCE(sum(${value}), 0) AS gmv
               FROM shipments s JOIN orders o ON o.id = s.order_id JOIN shops sh ON sh.id = s.shop_id
              WHERE o.created_at > ${since} AND s.status <> 'cancelled'
              GROUP BY sh.id, sh.name, sh.town ORDER BY gmv DESC LIMIT 10`),
      group(`SELECT p.category AS key, sum(i.qty)::int AS units, COALESCE(sum(i.qty * i.unit_price), 0) AS gmv
               FROM order_items i JOIN shipments s ON s.id = i.shipment_id JOIN orders o ON o.id = s.order_id
               JOIN products p ON p.id = i.product_id
              WHERE o.created_at > ${since} AND s.status <> 'cancelled' GROUP BY p.category ORDER BY gmv DESC`),
      group(`SELECT o.payment_method AS key, count(*)::int AS orders, COALESCE(sum(o.total), 0) AS gmv
               FROM orders o WHERE o.created_at > ${since} GROUP BY o.payment_method ORDER BY orders DESC`),
      group(`SELECT s.courier_name AS key, count(*)::int AS orders, COALESCE(sum(s.fee), 0) AS gmv
               FROM shipments s JOIN orders o ON o.id = s.order_id
              WHERE o.created_at > ${since} AND s.status <> 'cancelled' GROUP BY s.courier_name ORDER BY orders DESC`),
    ]);
    const rows = (list) =>
      list.map((r) => ({ key: r.key, name: r.name, town: r.town, orders: r.orders, units: r.units, gmv: Number(r.gmv) }));

    const gmv = Number(totals.gmv);
    res.json({
      days,
      orders: totals.orders,
      buyers: totals.buyers,
      gmv,
      averageOrder: totals.orders ? round2(gmv / totals.orders) : 0,
      commission: round2(Number(earned.commission)),
      vouchers: Number(totals.vouchers),
      refunds: Number(growth.refunds),
      cancellationRate: totals.parcels ? round2(totals.cancelled / totals.parcels) : 0,
      delivered: totals.delivered,
      newUsers: growth.new_users,
      newShops: growth.new_shops,
      daily: daily.map((d) => ({ day: d.day, orders: d.orders, gmv: Number(d.gmv), users: d.users })),
      provinces: rows(provinces),
      shops: rows(shops),
      categories: rows(categories),
      payments: rows(payments),
      couriers: rows(couriers),
    });
  });

  // ----- Seller payouts -----
  router.get('/payouts', async (_req, res) => {
    const balances = await shopBalances(db);
    const shops = await db.query('SELECT id, name, town, phone FROM shops');
    const byId = Object.fromEntries(shops.map((s) => [s.id, s]));
    res.json(
      balances
        .map((b) => ({ ...b, shopName: byId[b.shopId]?.name, shopTown: byId[b.shopId]?.town, shopPhone: byId[b.shopId]?.phone }))
        .sort((a, b) => b.available - a.available),
    );
  });

  router.get('/payouts/history', async (req, res) => {
    const { shopId } = parse(z.object({ shopId: z.string().max(40).optional() }), req.query);
    const rows = await db.query(
      `SELECT p.*, sh.name AS shop_name FROM payouts p JOIN shops sh ON sh.id = p.shop_id
        WHERE ($1::text IS NULL OR p.shop_id = $1) ORDER BY p.created_at DESC LIMIT 200`,
      [shopId ?? null],
    );
    res.json(rows.map(toPayout));
  });

  router.post('/payouts', async (req, res) => {
    const b = parse(
      z.object({
        shopId: z.string().max(40),
        amount: z.coerce.number().positive('Enter the amount paid'),
        method: z.enum(['mtn', 'airtel', 'zamtel', 'bank']),
        reference: z.string().trim().min(3, 'Enter the Mobile Money or bank reference').max(60),
        note: z.string().trim().max(300).default(''),
      }),
      req.body,
    );
    const payout = await db.tx(async (t) => {
      // One payout at a time per shop, so two staff can't pay the same balance twice.
      const [shop] = await t.query('SELECT id, name FROM shops WHERE id = $1 FOR UPDATE', [b.shopId]);
      if (!shop) throw new HttpError(404, 'Shop not found');
      const balance = await shopBalances(t, shop.id);
      if (round2(b.amount) > balance.available) {
        throw new HttpError(409, `Only K${balance.available.toFixed(2)} is available to pay ${shop.name}`);
      }
      const id = newId('pay');
      const [row] = await t.query(
        `INSERT INTO payouts (id, shop_id, amount, method, reference, note, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [id, shop.id, round2(b.amount), b.method, b.reference, b.note, req.user.id],
      );
      await logAdmin(t, req.user.id, 'payout', 'shop', shop.id, `K${round2(b.amount)} ${b.method} ${b.reference}`);
      await notifyShopOwner(t, shop.id, {
        kind: 'payout',
        title: `Zed Market paid you K${round2(b.amount).toLocaleString('en-ZM')}`,
        body: `Reference ${b.reference}`,
        link: '/seller?tab=report',
      });
      return { ...row, shop_name: shop.name };
    });
    res.status(201).json(toPayout(payout));
  });

  // ----- Homepage banners -----
  router.get('/banners', async (_req, res) => {
    const rows = await db.query('SELECT * FROM banners ORDER BY active DESC, position, created_at DESC');
    res.json(rows.map(toBanner));
  });

  router.post('/banners', async (req, res) => {
    const b = parse(bannerSchema, req.body);
    const id = newId('bnr');
    const [row] = await db.query(
      `INSERT INTO banners (id, title, text, cta, link, image, theme, position, starts_at, ends_at, active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, now()), $10, $11, $12) RETURNING *`,
      [id, b.title, b.text, b.cta, b.link, b.image || null, b.theme, b.position, b.startsAt ?? null, b.endsAt ?? null, b.active, req.user.id],
    );
    await logAdmin(db, req.user.id, 'banner created', 'banner', id, b.title);
    res.status(201).json(toBanner(row));
  });

  router.patch('/banners/:id', async (req, res) => {
    const b = parse(bannerSchema.partial(), req.body);
    const [current] = await db.query('SELECT * FROM banners WHERE id = $1', [req.params.id]);
    if (!current) throw new HttpError(404, 'Banner not found');
    const next = { ...toBanner(current), ...b };
    const [row] = await db.query(
      `UPDATE banners SET title = $2, text = $3, cta = $4, link = $5, image = $6, theme = $7, position = $8,
              starts_at = COALESCE($9, starts_at), ends_at = $10, active = $11 WHERE id = $1 RETURNING *`,
      [current.id, next.title, next.text, next.cta, next.link, next.image || null, next.theme, next.position, b.startsAt ?? null, next.endsAt ?? null, next.active],
    );
    await logAdmin(db, req.user.id, next.active ? 'banner updated' : 'banner hidden', 'banner', current.id, next.title);
    res.json(toBanner(row));
  });

  router.delete('/banners/:id', async (req, res) => {
    const rows = await db.query('DELETE FROM banners WHERE id = $1 RETURNING title', [req.params.id]);
    if (!rows.length) throw new HttpError(404, 'Banner not found');
    await logAdmin(db, req.user.id, 'banner deleted', 'banner', req.params.id, rows[0].title);
    res.json({ ok: true });
  });

  // ----- Voucher campaigns (paid for by Zed Market) -----
  router.get('/campaigns', async (_req, res) => {
    const rows = await db.query(
      `SELECT c.*, (SELECT count(*) FROM vouchers v WHERE v.campaign_id = c.id AND v.used_order_id IS NOT NULL)::int AS used
         FROM voucher_campaigns c ORDER BY c.created_at DESC LIMIT 100`,
    );
    res.json(
      rows.map((c) => ({
        id: c.id,
        name: c.name,
        amount: Number(c.amount),
        minSpend: Number(c.min_spend),
        audience: c.audience,
        province: c.province,
        expiresAt: c.expires_at,
        issued: c.issued,
        used: c.used,
        date: c.created_at,
      })),
    );
  });

  router.post('/campaigns', async (req, res) => {
    const b = parse(
      z
        .object({
          name: z.string().trim().min(3, 'Name the campaign, e.g. Independence Day').max(60),
          amount: z.coerce.number().positive('Enter the voucher amount').max(5000),
          minSpend: z.coerce.number().min(0).optional(),
          days: z.coerce.number().int().min(1).max(365).default(30),
          audience: z.enum(['all', 'buyers', 'sellers', 'province', 'phone']),
          province: province.optional(),
          phone: z.string().optional(),
        })
        .refine((v) => v.audience !== 'province' || v.province, 'Choose the province')
        .refine((v) => v.audience !== 'phone' || /^[79]\d{8}$/.test(normalizePhone(v.phone ?? '')), 'Enter a valid phone number'),
      req.body,
    );
    b.minSpend ??= (await getSettings(db)).voucherMinSpend;
    const target = b.audience === 'province' ? b.province : b.audience === 'phone' ? normalizePhone(b.phone) : null;
    const result = await db.tx(async (t) => {
      const id = newId('cmp');
      await t.query(
        `INSERT INTO voucher_campaigns (id, name, amount, min_spend, audience, province, expires_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, now() + make_interval(days => $7), $8)`,
        [id, b.name, b.amount, b.minSpend, b.audience, b.audience === 'province' ? b.province : null, b.days, req.user.id],
      );
      const users = await t.query(
        `SELECT u.id FROM users u WHERE ${ACTIVE_USER} AND ${audienceSql(b.audience)}`,
        target ? [target] : [],
      );
      if (b.audience === 'phone' && !users.length) throw new HttpError(404, 'No customer has that phone number');
      for (const u of users) {
        await t.query(
          `INSERT INTO vouchers (id, user_id, amount, min_spend, reason, campaign_id, note, expires_at)
           SELECT $1, $2, amount, min_spend, 'campaign', id, name, expires_at FROM voucher_campaigns WHERE id = $3`,
          [newId('vch'), u.id, id],
        );
        await notify(t, u.id, {
          kind: 'voucher',
          title: `🎁 K${b.amount} voucher: ${b.name}`,
          body: `Use it at checkout on orders over K${b.minSpend} within ${b.days} days.`,
          link: '/account?tab=invite',
        });
      }
      await t.query('UPDATE voucher_campaigns SET issued = $2 WHERE id = $1', [id, users.length]);
      await logAdmin(t, req.user.id, 'voucher campaign', 'campaign', id, `${b.name}: K${b.amount} × ${users.length}`);
      return { id, issued: users.length };
    });
    res.status(201).json(result);
  });

  // ----- Announcements to the bell -----
  router.get('/announcements', async (_req, res) => {
    const rows = await db.query('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 100');
    res.json(
      rows.map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        link: a.link,
        audience: a.audience,
        province: a.province,
        sent: a.sent,
        date: a.created_at,
      })),
    );
  });

  router.post('/announcements', async (req, res) => {
    const b = parse(
      z
        .object({
          title: z.string().trim().min(3, 'Give it a title').max(80),
          body: z.string().trim().max(300).default(''),
          link: z.union([internalLink, z.literal('')]).optional(),
          audience: z.enum(['all', 'buyers', 'sellers', 'province']),
          province: province.optional(),
        })
        .refine((v) => v.audience !== 'province' || v.province, 'Choose the province'),
      req.body,
    );
    const result = await db.tx(async (t) => {
      const id = newId('ann');
      const params = b.audience === 'province' ? [b.province] : [];
      const users = await t.query(`SELECT u.id FROM users u WHERE ${ACTIVE_USER} AND ${audienceSql(b.audience)}`, params);
      for (const u of users) {
        await notify(t, u.id, { kind: 'announcement', title: b.title, body: b.body, link: b.link || null });
      }
      await t.query(
        `INSERT INTO announcements (id, title, body, link, audience, province, sent, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, b.title, b.body, b.link || null, b.audience, b.province ?? null, users.length, req.user.id],
      );
      await logAdmin(t, req.user.id, 'announcement', 'announcement', id, `${b.title} → ${users.length}`);
      return { id, sent: users.length };
    });
    res.status(201).json(result);
  });

  // ----- Buying requests moderation -----
  router.get('/requests', async (req, res) => {
    const { q, status } = parse(
      z.object({ q: z.string().trim().max(80).default(''), status: z.enum(['open', 'removed', 'all']).default('open') }),
      req.query,
    );
    const rows = await db.query(
      `${REQUEST_SELECT}
        WHERE ($1 = 'all' OR ($1 = 'removed' AND r.removed_at IS NOT NULL)
               OR ($1 = 'open' AND r.removed_at IS NULL AND r.status = 'open'))
          AND ($2 = '' OR r.title ILIKE '%' || $2 || '%' OR u.name ILIKE '%' || $2 || '%')
        ORDER BY r.created_at DESC LIMIT 100`,
      [status, q.replace(/[\\%_]/g, '')],
    );
    res.json(rows.map(toRequest));
  });

  router.post('/requests/:id/remove', async (req, res) => {
    const { reason: why } = parse(z.object({ reason }), req.body);
    await db.tx(async (t) => {
      const [r] = await t.query(
        `UPDATE buying_requests SET status = 'closed', removed_at = now(), removed_reason = $2
          WHERE id = $1 AND removed_at IS NULL RETURNING buyer_id, title`,
        [req.params.id, why],
      );
      if (!r) throw new HttpError(404, 'Request not found or already removed');
      await logAdmin(t, req.user.id, 'request removed', 'request', req.params.id, why);
      await notify(t, r.buyer_id, {
        kind: 'listing',
        title: `Your request "${r.title}" was removed`,
        body: why,
        link: `/requests/${req.params.id}`,
      });
    });
    res.json({ ok: true });
  });

  return router;
}
