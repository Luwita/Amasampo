// Database helpers shared by several route files.
import { categories } from '../src/data/catalog.js';
import { expandSearch } from '../src/data/search.js';
import { HttpError, newId } from './http.js';
import { toOrder, toProduct } from './mappers.js';

export async function myShopOrFail(db, user) {
  if (!user.shopId) throw new HttpError(403, 'Open a shop first');
  const [shop] = await db.query('SELECT * FROM shops WHERE id = $1', [user.shopId]);
  return shop;
}

// Orders with their parcels and items; `shopId` limits parcels to one shop (the seller's view).
export async function loadOrders(db, orderRows, shopId = null) {
  if (!orderRows.length) return [];
  const shipments = await db.query(
    `SELECT s.*, sh.name AS shop_name, sh.province AS shop_province, sh.town AS shop_town, sh.area AS shop_area, sh.phone AS shop_phone,
            sh.tpin AS shop_tpin, sh.vat_registered AS shop_vat_registered,
            COALESCE((
              SELECT json_agg(json_build_object(
                       'product_id', i.product_id, 'name', i.name, 'options', i.options, 'qty', i.qty,
                       'unit_price', i.unit_price, 'price_request_id', i.price_request_id,
                       'review_rating', (SELECT r.rating FROM reviews r WHERE r.order_id = s.order_id AND r.product_id = i.product_id)
                     ) ORDER BY i.name, i.options)
                FROM order_items i WHERE i.shipment_id = s.id), '[]') AS items
       FROM shipments s JOIN shops sh ON sh.id = s.shop_id
      WHERE s.order_id = ANY($1) AND ($2::text IS NULL OR s.shop_id = $2)
      ORDER BY sh.name`,
    [orderRows.map((o) => o.id), shopId],
  );
  return orderRows.map((o) =>
    toOrder(
      o,
      shipments.filter((s) => s.order_id === o.id),
    ),
  );
}

const productParams = (p) => [
  p.name,
  p.category,
  categories.find((c) => c.id === p.category).icon,
  p.description || p.name,
  p.price,
  p.oldPrice ?? null,
  JSON.stringify(p.tiers),
  p.stock,
  p.local,
  JSON.stringify(p.images),
  p.weightKg,
  JSON.stringify(p.options),
  p.lowStockAt,
];

export async function insertProduct(q, shopId, p) {
  const [row] = await q.query(
    `INSERT INTO products (id, shop_id, badge, name, category, icon, description, price, old_price, tiers, stock, local,
                           images, weight_kg, options, low_stock_at)
     VALUES ($1, $2, 'New', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
    [newId('prd'), shopId, ...productParams(p)],
  );
  return toProduct(row);
}

export async function updateProduct(q, id, shopId, p) {
  const [row] = await q.query(
    `UPDATE products SET name = $3, category = $4, icon = $5, description = $6, price = $7, old_price = $8, tiers = $9,
            stock = $10, local = $11, images = $12, weight_kg = $13, options = $14, low_stock_at = $15
      WHERE id = $1 AND shop_id = $2 AND deleted_at IS NULL RETURNING *`,
    [id, shopId, ...productParams(p)],
  );
  return row ? toProduct(row) : null;
}

// Builds the product search query. Matching is typo-tolerant (pg_trgm) and understands local synonyms.
export async function searchProducts(db, f) {
  const params = [];
  const add = (v) => {
    params.push(v);
    return `$${params.length}`;
  };
  const where = ['p.deleted_at IS NULL'];
  let rank = null; // relevance expression, only when searching

  if (f.ids) where.push(`p.id = ANY(${add(f.ids.split(',').slice(0, 100))})`);
  if (f.q) {
    // Only what the shopper typed gets typo tolerance and matches shop names and towns; synonyms must appear
    // as written in the product, otherwise e.g. the synonym "african print" would fuzzily match "Printer".
    // 0.55 keeps real typos (solr → Solar 0.60, chitenje → Chitenge 0.67) and drops near-misses (kitwe → Kit 0.50).
    const terms = add(expandSearch(f.q));
    const typed = add(f.q.trim().toLowerCase());
    where.push(`(word_similarity(${typed}::text, p.name) > 0.55
      OR strpos(lower(sh.name), ${typed}::text) > 0
      OR lower(sh.town) = ${typed}::text
      OR EXISTS (
        SELECT 1 FROM unnest(${terms}::text[]) term
         WHERE strpos(lower(p.name), term) > 0
            OR p.category = term
            OR (length(term) >= 4 AND starts_with(p.category, term))
            OR (length(term) >= 4 AND strpos(lower(p.description), term) > 0)))`);
    rank = `GREATEST(word_similarity(${typed}::text, p.name),
               (SELECT max(CASE WHEN strpos(lower(p.name), term) > 0 THEN 1 ELSE 0 END) FROM unnest(${terms}::text[]) term))`;
  }
  if (f.cat) where.push(`p.category = ${add(f.cat)}`);
  if (f.prov) where.push(`sh.province = ${add(f.prov)}`);
  if (f.town) where.push(`sh.town = ${add(f.town)}`);
  if (f.shop) where.push(`p.shop_id = ${add(f.shop)}`);
  if (f.local) where.push('p.local');
  if (f.wholesale) where.push(`jsonb_array_length(p.tiers) > 0`);
  if (f.lowStock) where.push('p.stock <= p.low_stock_at');
  if (f.featured) where.push('p.featured_until > now()');
  if (f.max) where.push(`p.price <= ${add(f.max)}`);

  const from = `FROM products p JOIN shops sh ON sh.id = p.shop_id WHERE ${where.join(' AND ')}`;
  const [{ total }] = await db.query(`SELECT count(*)::int AS total ${from}`, [...params]);

  const sort = f.sort || (f.q ? 'relevance' : 'popular');
  // Only add the buyer's location as parameters when sorting by distance: Postgres rejects unused parameters.
  let distance = null;
  if (sort === 'nearest' && f.nearProv && f.nearTown) {
    const prov = add(f.nearProv);
    distance = `CASE WHEN sh.province = ${prov} AND sh.town = ${add(f.nearTown)} THEN 0
                     WHEN sh.province = ${prov} THEN 1 ELSE 2 END`;
  }
  const orderBy = {
    // A bare number in ORDER BY means a column position, so missing parts are left out rather than set to 0.
    relevance: [rank && `${rank} DESC`, 'p.sold DESC'],
    nearest: [distance, rank && `${rank} DESC`, 'p.sold DESC'],
    popular: 'p.sold DESC',
    newest: 'p.created_at DESC',
    deals: 'CASE WHEN p.old_price > p.price THEN (p.old_price - p.price) / p.old_price ELSE 0 END DESC',
    'price-asc': 'p.price ASC',
    'price-desc': 'p.price DESC',
    rating: 'p.rating DESC, p.review_count DESC',
  }[sort];
  const orderSql = [orderBy].flat().filter(Boolean).join(', ');

  const rows = await db.query(
    `SELECT p.* ${from} ORDER BY ${orderSql}, p.id LIMIT ${add(f.limit)} OFFSET ${add((f.page - 1) * f.limit)}`,
    params,
  );
  return { items: rows.map(toProduct), total, page: f.page, pageSize: f.limit };
}

// Keeps product and shop ratings in step with their reviews.
export async function refreshRatings(q, productId, shopId) {
  await q.query(
    `UPDATE products SET rating = COALESCE((SELECT round(avg(rating), 1) FROM reviews WHERE product_id = $1), 0),
            review_count = (SELECT count(*) FROM reviews WHERE product_id = $1)
      WHERE id = $1`,
    [productId],
  );
  await q.query(
    `UPDATE shops SET rating = COALESCE((SELECT round(avg(rating), 1) FROM reviews WHERE shop_id = $1), 0),
            review_count = (SELECT count(*) FROM reviews WHERE shop_id = $1)
      WHERE id = $1`,
    [shopId],
  );
}
