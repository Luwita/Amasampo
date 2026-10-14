import { Router } from 'express';
import { z } from 'zod';
import { normalizePhone } from '../../src/utils/format.js';
import { requireAdmin, requireOwner } from '../auth.js';
import { HttpError, newId, parse } from '../http.js';
import { toOwnShop } from '../mappers.js';
import { notify, notifyShopOwner } from '../notify.js';
import { loadOrders, logAdmin, updateProduct } from '../queries.js';
import { productSchema, shopSchema } from '../schemas.js';
import { SETTINGS, getSettings, settingsSchema } from '../settings.js';
import { saveShop } from './catalog.js';
import { advanceShipment, confirmPayment, shipmentUpdateSchema } from './orders.js';

const reason = z.string().trim().min(3, 'Give a reason; it is shown to the shop and kept in the log').max(500);

// Full control for Zed Market staff: the staff list, platform settings, and editing anything on a shop's behalf.
// `adminPhones` are the owners: they can't be removed or suspended from inside the app.
export function adminControlRoutes(db, { adminPhones = [] } = {}) {
  const owners = new Set(adminPhones.map(normalizePhone).filter(Boolean));
  const router = Router();
  router.use(requireAdmin);

  // ----- Staff -----
  router.get('/staff', async (_req, res) => {
    const rows = await db.query(
      `SELECT id, name, phone, is_staff, staff_since, created_at FROM users
        WHERE (is_staff OR phone = ANY($1)) AND deleted_at IS NULL ORDER BY staff_since NULLS FIRST, created_at`,
      [[...owners]],
    );
    const signedUp = new Set(rows.map((r) => r.phone));
    res.json([
      ...rows.map((r) => ({
        id: r.id,
        name: r.name,
        phone: `0${r.phone}`,
        role: owners.has(r.phone) ? 'owner' : 'staff',
        since: r.staff_since ?? r.created_at,
      })),
      // Owners listed in ADMIN_PHONES who haven't signed in yet.
      ...[...owners]
        .filter((p) => !signedUp.has(p))
        .map((p) => ({ id: null, name: 'Not signed in yet', phone: `0${p}`, role: 'owner', since: null })),
    ]);
  });

  router.post('/staff', requireOwner, async (req, res) => {
    const b = parse(
      z.object({
        phone: z.string().refine((p) => /^[79]\d{8}$/.test(normalizePhone(p)), 'Enter a valid Zambian mobile number'),
        name: z.string().trim().max(80).optional(),
      }),
      req.body,
    );
    const phone = normalizePhone(b.phone);
    if (owners.has(phone)) throw new HttpError(409, 'That number is already an owner');
    const added = await db.tx(async (t) => {
      let [user] = await t.query('SELECT * FROM users WHERE phone = $1 AND deleted_at IS NULL', [phone]);
      if (user?.is_staff) throw new HttpError(409, `${user.name} is already staff`);
      if (user) {
        const [shop] = await t.query('SELECT name FROM shops WHERE owner_id = $1', [user.id]);
        if (shop) {
          throw new HttpError(
            409,
            `${user.name} owns the shop ${shop.name}. Staff accounts can't have a shop, so use another number.`,
          );
        }
        [user] = await t.query(
          `UPDATE users SET is_staff = true, staff_since = now(), account_type = 'admin' WHERE id = $1 RETURNING *`,
          [user.id],
        );
      } else {
        // They sign in later with this number and land in the admin panel.
        [user] = await t.query(
          `INSERT INTO users (id, phone, name, account_type, referral_code, is_staff, staff_since)
           VALUES ($1, $2, $3, 'admin', $4, true, now()) RETURNING *`,
          [newId('usr'), phone, b.name || 'Zed Market staff', `ZS${phone}`],
        );
      }
      await t.query('DELETE FROM sessions WHERE user_id = $1', [user.id]); // sign in again as staff
      await logAdmin(t, req.user.id, 'staff added', 'user', user.id, `0${phone}`);
      await notify(t, user.id, {
        kind: 'shop',
        title: 'You are now Zed Market staff',
        body: 'Sign in to open the admin panel.',
        link: '/admin',
      });
      return user;
    });
    res.status(201).json({ id: added.id, name: added.name, phone: `0${phone}`, role: 'staff' });
  });

  router.delete('/staff/:id', requireOwner, async (req, res) => {
    await db.tx(async (t) => {
      const [user] = await t.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
      if (!user) throw new HttpError(404, 'User not found');
      if (owners.has(user.phone)) throw new HttpError(409, 'Owners are set in ADMIN_PHONES on the server');
      if (!user.is_staff) throw new HttpError(409, `${user.name} is not staff`);
      await t.query(`UPDATE users SET is_staff = false, account_type = 'buyer' WHERE id = $1`, [user.id]);
      await t.query('DELETE FROM sessions WHERE user_id = $1', [user.id]);
      await logAdmin(t, req.user.id, 'staff removed', 'user', user.id, `0${user.phone}`);
    });
    res.json({ ok: true });
  });

  // ----- Platform settings -----
  router.get('/settings', async (_req, res) => {
    res.json({ values: await getSettings(db), defaults: Object.fromEntries(Object.entries(SETTINGS).map(([k, s]) => [k, s.default])) });
  });

  router.patch('/settings', requireOwner, async (req, res) => {
    const changes = Object.entries(parse(settingsSchema, req.body)).filter(([, v]) => v !== undefined);
    if (!changes.length) throw new HttpError(400, 'Nothing to change');
    await db.tx(async (t) => {
      const before = await getSettings(t);
      for (const [key, value] of changes) {
        await t.query(
          `INSERT INTO settings (key, value, updated_by) VALUES ($1, $2, $3)
           ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = now()`,
          [key, value, req.user.id],
        );
      }
      await logAdmin(
        t,
        req.user.id,
        'settings changed',
        'settings',
        'platform',
        changes.map(([k, v]) => `${k}: ${before[k]} → ${v}`).join(', '),
      );
    });
    res.json(await getSettings(db));
  });

  // ----- Editing on a shop's behalf -----
  router.get('/shops/:id', async (req, res) => {
    const [row] = await db.query('SELECT * FROM shops WHERE id = $1', [req.params.id]);
    if (!row) throw new HttpError(404, 'Shop not found');
    res.json(toOwnShop(row));
  });

  router.put('/shops/:id', async (req, res) => {
    const [shop] = await db.query('SELECT * FROM shops WHERE id = $1', [req.params.id]);
    if (!shop) throw new HttpError(404, 'Shop not found');
    const { note, ...body } = req.body ?? {};
    const why = parse(reason, note);
    const row = await db.tx(async (t) => {
      const saved = await saveShop(t, shop, parse(shopSchema, body));
      await logAdmin(t, req.user.id, 'shop edited', 'shop', shop.id, why);
      await notifyShopOwner(t, shop.id, {
        kind: 'shop',
        title: 'Zed Market updated your shop details',
        body: why,
        link: '/seller?tab=settings',
      });
      return saved;
    });
    res.json(toOwnShop(row));
  });

  router.put('/products/:id', async (req, res) => {
    const [product] = await db.query('SELECT id, shop_id, name FROM products WHERE id = $1 AND deleted_at IS NULL', [
      req.params.id,
    ]);
    if (!product) throw new HttpError(404, 'Product not found');
    const { note, ...body } = req.body ?? {};
    const why = parse(reason, note);
    const updated = await db.tx(async (t) => {
      const saved = await updateProduct(t, product.id, product.shop_id, parse(productSchema, body));
      await logAdmin(t, req.user.id, 'listing edited', 'product', product.id, why);
      await notifyShopOwner(t, product.shop_id, {
        kind: 'listing',
        title: `Zed Market edited your listing "${product.name}"`,
        body: why,
        link: `/product/${product.id}`,
      });
      return saved;
    });
    res.json(updated);
  });

  // Confirm a Mobile Money payment for a shop, e.g. when the owner confirms by phone but can't use the app.
  router.post('/orders/:orderId/shipments/:shopId/paid', async (req, res) => {
    const [shop] = await db.query('SELECT * FROM shops WHERE id = $1', [req.params.shopId]);
    if (!shop) throw new HttpError(404, 'Shop not found');
    const why = parse(reason, req.body?.note);
    const order = await confirmPayment(db, req.params.orderId, shop, async (t) => {
      await logAdmin(t, req.user.id, 'payment confirmed', 'order', req.params.orderId, `${shop.name}: ${why}`);
      await notifyShopOwner(t, shop.id, {
        kind: 'payment',
        title: `Zed Market confirmed the payment for order ${req.params.orderId}`,
        body: `${why}. You can now send the parcel.`,
        link: '/seller?tab=orders',
      });
    });
    const [full] = await loadOrders(db, [order]);
    res.json(full);
  });

  // Mark a parcel sent or delivered for a shop, e.g. when the courier confirms delivery by phone.
  router.patch('/orders/:orderId/shipments/:shopId/status', async (req, res) => {
    const [shop] = await db.query('SELECT * FROM shops WHERE id = $1', [req.params.shopId]);
    if (!shop) throw new HttpError(404, 'Shop not found');
    const { note, ...body } = req.body ?? {};
    const why = parse(reason, note);
    const update = parse(shipmentUpdateSchema, body);
    await advanceShipment(db, req.params.orderId, shop, update);
    await logAdmin(db, req.user.id, `parcel marked ${update.status}`, 'order', req.params.orderId, `${shop.name}: ${why}`);
    const [order] = await db.query('SELECT * FROM orders WHERE id = $1', [req.params.orderId]);
    const [full] = await loadOrders(db, [order]);
    res.json(full);
  });

  return router;
}
