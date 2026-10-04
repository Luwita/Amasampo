import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { HttpError, newId, parse } from '../http.js';
import { toProduct, toShop } from '../mappers.js';
import { insertProduct, myShopOrFail, searchProducts, updateProduct } from '../queries.js';
import { productSchema, searchSchema, shopSchema } from '../schemas.js';

const BULK_LIMIT = 200;

export function catalogRoutes(db, { uploadDir }) {
  const router = Router();

  // ----- Public -----
  router.get('/shops', async (_req, res) => {
    const rows = await db.query(
      `SELECT sh.*, (SELECT count(*) FROM products p WHERE p.shop_id = sh.id AND p.deleted_at IS NULL)::int AS product_count
         FROM shops sh ORDER BY sh.created_at, sh.id`,
    );
    res.json(rows.map(toShop));
  });

  router.get('/shops/:id', async (req, res) => {
    const [shop] = await db.query('SELECT * FROM shops WHERE id = $1', [req.params.id]);
    if (!shop) throw new HttpError(404, 'Shop not found');
    res.json(toShop(shop));
  });

  // Search, filter, sort and page the catalogue. Returns { items, total, page, pageSize }.
  router.get('/products', async (req, res) => {
    res.json(await searchProducts(db, parse(searchSchema, req.query)));
  });

  router.get('/products/:id', async (req, res) => {
    const [row] = await db.query('SELECT * FROM products WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (!row) throw new HttpError(404, 'Product not found');
    res.json(toProduct(row));
  });

  router.get('/stats/provinces', async (_req, res) => {
    const rows = await db.query(
      `SELECT sh.province, count(DISTINCT sh.id)::int AS shops, count(p.id)::int AS products
         FROM shops sh LEFT JOIN products p ON p.shop_id = sh.id AND p.deleted_at IS NULL
        GROUP BY sh.province`,
    );
    res.json(Object.fromEntries(rows.map((r) => [r.province, { shops: r.shops, products: r.products }])));
  });

  // ----- Shop owners -----
  router.post('/shops', requireUser, async (req, res) => {
    if (req.user.shopId) throw new HttpError(409, 'You already have a shop');
    const s = parse(shopSchema, req.body);
    const ownerName = z.string().trim().max(80).optional().parse(req.body.ownerName);
    const [row] = await db.tx(async (t) => {
      if (ownerName) await t.query('UPDATE users SET name = $1 WHERE id = $2', [ownerName, req.user.id]);
      await t.query(`UPDATE users SET account_type = 'seller' WHERE id = $1 AND account_type <> 'admin'`, [
        req.user.id,
      ]);
      return t.query(
        `INSERT INTO shops (id, owner_id, name, logo, category, province, town, area, phone, couriers, own_rates, since,
                            tpin, vat_registered)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
        [
          newId('shop'),
          req.user.id,
          s.name,
          s.logo ?? '🏪',
          s.category || null,
          s.province,
          s.town,
          s.area,
          s.phone,
          JSON.stringify(s.couriers),
          s.ownRates ? JSON.stringify(s.ownRates) : null,
          new Date().getFullYear(),
          s.tpin || null,
          s.vatRegistered,
        ],
      );
    });
    res.status(201).json(toShop(row));
  });

  router.patch('/shops/:id', requireUser, async (req, res) => {
    const shop = await myShopOrFail(db, req.user);
    if (shop.id !== req.params.id) throw new HttpError(403, 'You can only edit your own shop');
    const s = parse(shopSchema, req.body);
    const [row] = await db.query(
      `UPDATE shops SET name = $2, logo = $3, category = $4, province = $5, town = $6, area = $7, phone = $8,
              couriers = $9, own_rates = $10, tpin = $11, vat_registered = $12
        WHERE id = $1 RETURNING *`,
      [
        shop.id,
        s.name,
        s.logo ?? shop.logo,
        s.category || null,
        s.province,
        s.town,
        s.area,
        s.phone,
        JSON.stringify(s.couriers),
        s.ownRates ? JSON.stringify(s.ownRates) : null,
        s.tpin || null,
        s.vatRegistered,
      ],
    );
    res.json(toShop(row));
  });

  router.post('/products', requireUser, async (req, res) => {
    const shop = await myShopOrFail(db, req.user);
    res.status(201).json(await insertProduct(db, shop.id, parse(productSchema, req.body)));
  });

  // Many products at once (from a spreadsheet). All rows are checked first; nothing is saved if any row is wrong.
  router.post('/products/bulk', requireUser, async (req, res) => {
    const shop = await myShopOrFail(db, req.user);
    const { products } = parse(
      z.object({
        products: z
          .array(z.unknown())
          .min(1, 'The file has no products')
          .max(BULK_LIMIT, `Upload at most ${BULK_LIMIT} products at a time`),
      }),
      req.body,
    );
    const parsed = products.map((p) => productSchema.safeParse(p));
    const rows = parsed
      .map((r, i) => (r.success ? null : { row: i + 1, error: r.error.issues[0].message }))
      .filter(Boolean);
    if (rows.length) throw new HttpError(400, `${rows.length} row(s) need fixing`, { rows });

    const created = await db.tx(async (t) => {
      const out = [];
      for (const r of parsed) out.push(await insertProduct(t, shop.id, r.data));
      return out;
    });
    res.status(201).json({ created: created.length, items: created });
  });

  router.patch('/products/:id', requireUser, async (req, res) => {
    const shop = await myShopOrFail(db, req.user);
    const product = await updateProduct(db, req.params.id, shop.id, parse(productSchema, req.body));
    if (!product) throw new HttpError(404, 'Product not found in your shop');
    res.json(product);
  });

  router.delete('/products/:id', requireUser, async (req, res) => {
    const shop = await myShopOrFail(db, req.user);
    const rows = await db.query(
      'UPDATE products SET deleted_at = now() WHERE id = $1 AND shop_id = $2 AND deleted_at IS NULL RETURNING id',
      [req.params.id, shop.id],
    );
    if (!rows.length) throw new HttpError(404, 'Product not found in your shop');
    res.json({ ok: true });
  });

  // Product photos arrive as compressed JPEG data URLs from the browser.
  router.post('/uploads', requireUser, async (req, res) => {
    if (!req.user.shopId) throw new HttpError(403, 'Open a shop first');
    const { dataUrl } = parse(z.object({ dataUrl: z.string() }), req.body);
    const match = dataUrl.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw new HttpError(400, 'Upload a JPEG, PNG or WebP photo');
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length > 1_500_000) throw new HttpError(413, 'Photo is too large (max 1.5 MB)');
    const name = `${newId('img')}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`;
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, name), bytes);
    res.status(201).json({ url: `/uploads/${name}` });
  });

  return router;
}
