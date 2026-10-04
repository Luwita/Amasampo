// In-memory stand-in for src/api.js used by the React tests (see setupTests.js).
// It mirrors the server's behaviour closely enough to drive the UI; the real rules are tested in server/api.test.js.
import { categories, seedProducts } from '../data/catalog';
import { band, bandRank } from '../data/couriers';
import { priceOrder, OrderError } from '../data/pricing';
import { expandSearch } from '../data/search';
import { seedShops } from '../data/shops';
import { normalizePhone } from '../utils/format';

export class ApiError extends Error {
  constructor(status, message, data = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

const FAKE_CODE = '123456';
let db;
let token = null;

export function __reset() {
  db = {
    shops: seedShops.map((s) => ({ ...s, ownerId: null, ownRates: null })),
    products: seedProducts.map((p) => ({ ...p, images: [...p.images] })),
    users: [],
    sessions: {},
    orders: [],
    reviews: [],
    conversations: [],
    coupons: [],
    priceRequests: [],
  };
  token = null;
}
__reset();

const copy = (v) => JSON.parse(JSON.stringify(v));
const currentUser = () => {
  const user = db.users.find((u) => u.id === db.sessions[token]);
  if (!user) throw new ApiError(401, 'Please sign in first');
  return { ...user, shopId: db.shops.find((s) => s.ownerId === user.id)?.id ?? null };
};
const myShop = () => {
  const shop = db.shops.find((s) => s.ownerId === currentUser().id);
  if (!shop) throw new ApiError(403, 'Open a shop first');
  return shop;
};

// Test helpers: start a test already signed in, optionally as the owner of a shop.
export function __signIn({ name = 'Test User', phone = '0977000111', accountType = 'buyer', shop } = {}) {
  const user = { id: `usr_${db.users.length + 1}`, name, phone, accountType };
  db.users.push(user);
  token = `tok_${user.id}`;
  db.sessions[token] = user.id;
  if (shop) db.shops.push({ since: 2026, rating: 0, ownRates: null, ...shop, ownerId: user.id });
  return token;
}
export const __addProduct = (product) =>
  db.products.push({
    images: [],
    tiers: [],
    options: [],
    sold: 0,
    rating: 0,
    reviewCount: 0,
    weightKg: 1,
    lowStockAt: 5,
    ...product,
  });
export const __db = () => db;

export const getToken = () => token;
export const setToken = (t) => {
  token = t;
};

export async function requestCode(phone) {
  if (!/^[79]\d{8}$/.test(normalizePhone(phone))) throw new ApiError(400, 'Enter a valid Zambian mobile number');
  return { sent: true, devCode: FAKE_CODE };
}

export async function verifyCode({ phone, code, name, accountType }) {
  if (code !== FAKE_CODE) throw new ApiError(400, 'That code is not correct');
  let user = db.users.find((u) => normalizePhone(u.phone) === normalizePhone(phone));
  if (!user) {
    user = {
      id: `usr_${db.users.length + 1}`,
      name: name || 'Amasampo Shopper',
      phone: `0${normalizePhone(phone)}`,
      accountType: accountType ?? 'buyer',
    };
    db.users.push(user);
  }
  const t = `tok_${user.id}_${Date.now()}`;
  db.sessions[t] = user.id;
  token = t;
  return { token: t, user: currentUser() };
}

export const me = async () => currentUser();
export const logout = async () => {
  delete db.sessions[token];
  return { ok: true };
};

const live = () => db.products.filter((p) => !p.deletedAt);
export const getShops = async () =>
  copy(db.shops.map((s) => ({ ...s, productCount: live().filter((p) => p.shopId === s.id).length })));

// Same filters and sorts as the server's search, without the typo tolerance.
export async function searchProducts(f = {}) {
  const shopOf = (p) => db.shops.find((s) => s.id === p.shopId);
  const terms = f.q ? expandSearch(f.q) : null;
  let items = live().filter((p) => {
    const shop = shopOf(p);
    return (
      (!f.ids || f.ids.split(',').includes(p.id)) &&
      (!terms || terms.some((t) => p.name.toLowerCase().includes(t) || p.category === t)) &&
      (!f.cat || p.category === f.cat) &&
      (!f.prov || shop.province === f.prov) &&
      (!f.town || shop.town === f.town) &&
      (!f.shop || p.shopId === f.shop) &&
      (!f.local || p.local) &&
      (!f.wholesale || p.tiers.length > 0) &&
      (!f.lowStock || p.stock <= p.lowStockAt) &&
      (!f.featured || (p.featuredUntil && new Date(p.featuredUntil) > new Date())) &&
      (!f.max || p.price <= Number(f.max))
    );
  });
  const near = { province: f.nearProv, town: f.nearTown };
  const sorts = {
    nearest: (a, b) => bandRank[band(shopOf(a), near)] - bandRank[band(shopOf(b), near)] || b.sold - a.sold,
    newest: (a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')),
    'price-asc': (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
  };
  items = [...items].sort(sorts[f.sort] ?? ((a, b) => b.sold - a.sold));
  const limit = Number(f.limit) || 24;
  const page = Number(f.page) || 1;
  return { items: copy(items.slice((page - 1) * limit, page * limit)), total: items.length, page, pageSize: limit };
}

export async function getProduct(id) {
  const p = live().find((x) => x.id === id);
  if (!p) throw new ApiError(404, 'Product not found');
  return copy(p);
}

export async function provinceStats() {
  const stats = {};
  db.shops.forEach((s) => {
    stats[s.province] = stats[s.province] ?? { shops: 0, products: 0 };
    stats[s.province].shops += 1;
    stats[s.province].products += live().filter((p) => p.shopId === s.id).length;
  });
  return stats;
}

export async function createShop({ ownerName, ...shop }) {
  const user = db.users.find((u) => u.id === currentUser().id);
  if (ownerName) user.name = ownerName;
  user.accountType = 'seller';
  const created = { ...shop, id: `shop_${db.shops.length + 1}`, ownerId: user.id, rating: 0, since: 2026 };
  db.shops.push(created);
  return copy(created);
}

export async function updateShop(id, patch) {
  const shop = myShop();
  if (shop.id !== id) throw new ApiError(403, 'You can only edit your own shop');
  Object.assign(shop, patch);
  return copy(shop);
}

export async function createProduct(data) {
  const shop = myShop();
  const product = {
    id: `prd_${db.products.length + 1}`,
    shopId: shop.id,
    icon: categories.find((c) => c.id === data.category)?.icon,
    sold: 0,
    rating: 0,
    reviewCount: 0,
    weightKg: 1,
    lowStockAt: 5,
    options: [],
    tiers: [],
    images: [],
    ...data,
    badge: 'New',
    createdAt: new Date().toISOString(),
  };
  db.products.push(product);
  return copy(product);
}

export async function updateProduct(id, data) {
  const product = db.products.find((p) => p.id === id && p.shopId === myShop().id);
  if (!product) throw new ApiError(404, 'Product not found in your shop');
  Object.assign(product, data);
  return copy(product);
}

export async function deleteProduct(id) {
  const product = db.products.find((p) => p.id === id && p.shopId === myShop().id);
  if (!product) throw new ApiError(404, 'Product not found in your shop');
  product.deletedAt = new Date().toISOString();
  return { ok: true };
}

export async function bulkCreateProducts(list) {
  const items = [];
  for (const data of list) items.push(await createProduct(data));
  return { created: items.length, items };
}

export const uploadImage = async () => ({ url: `/uploads/img_${Date.now()}.jpg` });

export async function productReviews(id) {
  const items = db.reviews.filter((r) => r.productId === id);
  const histogram = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  items.forEach((r) => (histogram[r.rating] += 1));
  const average = items.length ? items.reduce((s, r) => s + r.rating, 0) / items.length : 0;
  return { items: copy(items), count: items.length, average, histogram, page: 1, pageSize: 10 };
}
export const shopReviews = async (id) => copy(db.reviews.filter((r) => r.shopId === id));

export async function createReview({ orderId, productId, rating, comment = '' }) {
  const user = currentUser();
  const order = db.orders.find((o) => o.id === orderId && o.buyerId === user.id);
  const shipment = order?.shipments.find((s) => s.items.some((i) => i.id === productId));
  if (!shipment) throw new ApiError(403, 'You can only review products you bought');
  if (shipment.status !== 'delivered') throw new ApiError(409, 'You can review this once it has been delivered');
  if (db.reviews.some((r) => r.orderId === orderId && r.productId === productId))
    throw new ApiError(409, 'You already reviewed this item');
  const review = {
    id: `rev_${db.reviews.length + 1}`,
    productId,
    productName: shipment.items.find((i) => i.id === productId).name,
    shopId: shipment.shopId,
    orderId,
    author: user.name,
    rating,
    comment,
    reply: null,
    date: new Date().toISOString(),
  };
  db.reviews.push(review);
  shipment.items.filter((i) => i.id === productId).forEach((i) => (i.reviewRating = rating));
  const product = db.products.find((p) => p.id === productId);
  const mine = db.reviews.filter((r) => r.productId === productId);
  product.reviewCount = mine.length;
  product.rating = Math.round((mine.reduce((s, r) => s + r.rating, 0) / mine.length) * 10) / 10;
  return copy(review);
}

export async function replyToReview(id, reply) {
  const review = db.reviews.find((r) => r.id === id && r.shopId === myShop().id);
  if (!review) throw new ApiError(404, 'Review not found for your shop');
  review.reply = reply;
  return copy(review);
}
export const sellerReviews = async () => copy(db.reviews.filter((r) => r.shopId === myShop().id));

export async function sellerReport() {
  const shop = myShop();
  const parcels = db.orders.flatMap((o) => o.shipments.filter((s) => s.shopId === shop.id));
  return {
    days: 30,
    orders: parcels.length,
    units: parcels.reduce((n, s) => n + s.items.reduce((m, i) => m + i.qty, 0), 0),
    revenue: parcels.reduce((n, s) => n + s.subtotal, 0),
    deliveredRevenue: parcels.filter((s) => s.status === 'delivered').reduce((n, s) => n + s.subtotal, 0),
    toDispatch: parcels.filter((s) => s.status === 'pending').length,
    inTransit: parcels.filter((s) => s.status === 'dispatched').length,
    rating: shop.rating ?? 0,
    reviewCount: db.reviews.filter((r) => r.shopId === shop.id).length,
    topProducts: [],
    daily: [],
    lowStock: copy(live().filter((p) => p.shopId === shop.id && p.stock <= p.lowStockAt)),
  };
}

// Same pricing as the server, including discount codes and agreed prices.
function priceFor(user, { items, shipping, couriers, payment, coupon }) {
  const coupons = {};
  if (coupon) {
    const found = db.coupons.filter((c) => c.code === coupon.toUpperCase() && c.active);
    if (!found.length) throw new ApiError(409, `${coupon.toUpperCase()} isn't a valid code for the shops in your cart`);
    found.forEach((c) => (coupons[c.shopId] = { code: c.code, kind: c.kind, value: c.value, minSpend: c.minSpend }));
  }
  const quotes = Object.fromEntries(
    db.priceRequests
      .filter((r) => r.buyerId === user.id && r.status === 'accepted')
      .map((r) => [r.id, { productId: r.productId, qty: r.qty, price: r.quotedPrice }]),
  );
  try {
    return priceOrder({
      lines: items,
      getProduct: (id) => db.products.find((p) => p.id === id && !p.deletedAt),
      getShop: (id) => db.shops.find((sh) => sh.id === id),
      to: { province: shipping.province, town: shipping.town },
      picks: couriers,
      payment,
      coupons,
      quotes,
    });
  } catch (err) {
    if (err instanceof OrderError) throw new ApiError(409, err.message);
    throw err;
  }
}

export const quoteOrder = async (body) => copy(priceFor(currentUser(), body));

export async function placeOrder(body) {
  const { shipping, payment } = body;
  const user = currentUser();
  const priced = priceFor(user, body);
  priced.shipments.forEach((sh) =>
    sh.items.forEach((i) => {
      if (!i.quoteId) return;
      db.priceRequests.find((r) => r.id === i.quoteId).status = 'ordered';
    }),
  );
  priced.shipments.forEach((s) =>
    s.items.forEach((i) => {
      const p = db.products.find((x) => x.id === i.id);
      p.stock -= i.qty;
      p.sold += i.qty;
    }),
  );
  const order = {
    id: `AMS-TEST${db.orders.length + 1}`,
    buyerId: user.id,
    date: new Date().toISOString(),
    buyer: { name: shipping.name, phone: shipping.phone },
    shipping: { province: shipping.province, town: shipping.town, address: shipping.address },
    payment,
    paid: payment !== 'cod',
    subtotal: priced.subtotal,
    discount: priced.discount,
    delivery: priced.delivery,
    total: priced.total,
    shipments: priced.shipments.map((s) => {
      const shop = db.shops.find((x) => x.id === s.shopId);
      return {
        ...s,
        shopProvince: shop.province,
        shopTown: shop.town,
        shopArea: shop.area,
        shopPhone: shop.phone,
        shopTpin: shop.tpin ?? null,
        shopVatRegistered: !!shop.vatRegistered,
        status: 'pending',
        tracking: '',
      };
    }),
  };
  db.orders.unshift(order);
  return copy(order);
}

export const myOrders = async () => copy(db.orders.filter((o) => o.buyerId === currentUser().id));

export async function shopOrders() {
  const shop = myShop();
  return copy(
    db.orders
      .filter((o) => o.shipments.some((s) => s.shopId === shop.id))
      .map((o) => ({ ...o, shipments: o.shipments.filter((s) => s.shopId === shop.id) })),
  );
}

export async function updateShipment(orderId, shopId, patch) {
  if (myShop().id !== shopId) throw new ApiError(403, 'You can only update your own parcels');
  const order = db.orders.find((o) => o.id === orderId);
  const shipment = order?.shipments.find((s) => s.shopId === shopId);
  if (!shipment) throw new ApiError(404, 'Order not found');
  Object.assign(shipment, patch);
  return copy({ ...order, shipments: [shipment] });
}

// ----- Messages -----
const roleIn = (user, c) => (c.buyerId === user.id ? 'buyer' : user.shopId === c.shopId ? 'seller' : null);
const conversationView = (c, role) => {
  const shop = db.shops.find((x) => x.id === c.shopId);
  const buyer = db.users.find((u) => u.id === c.buyerId);
  const last = c.messages[c.messages.length - 1];
  return {
    id: c.id,
    role,
    shopId: c.shopId,
    shopName: shop.name,
    buyerName: buyer.name,
    withName: role === 'buyer' ? shop.name : buyer.name,
    productId: c.productId,
    productName: db.products.find((p) => p.id === c.productId)?.name ?? null,
    lastMessage: last?.body ?? '',
    lastMessageAt: last?.date ?? c.created,
    unread: c.unread[role],
  };
};
const addMessage = (c, from, body) => {
  c.messages.push({ id: `msg_${c.messages.length + 1}`, from, body, date: new Date().toISOString() });
  c.unread[from === 'buyer' ? 'seller' : 'buyer'] += 1;
};

export async function startConversation({ shopId, productId, body }) {
  const user = currentUser();
  if (!body?.trim()) throw new ApiError(400, 'Write a message');
  if (user.shopId === shopId) throw new ApiError(400, "You can't message your own shop");
  let c = db.conversations.find((x) => x.shopId === shopId && x.buyerId === user.id);
  if (!c) {
    c = {
      id: `cnv_${db.conversations.length + 1}`,
      shopId,
      buyerId: user.id,
      productId,
      messages: [],
      unread: { buyer: 0, seller: 0 },
      created: new Date().toISOString(),
    };
    db.conversations.push(c);
  }
  addMessage(c, 'buyer', body);
  return { id: c.id };
}

export async function listConversations() {
  const user = currentUser();
  return copy(db.conversations.filter((c) => roleIn(user, c)).map((c) => conversationView(c, roleIn(user, c))));
}

export async function unreadMessages() {
  const user = currentUser();
  return { count: db.conversations.reduce((n, c) => n + (roleIn(user, c) ? c.unread[roleIn(user, c)] : 0), 0) };
}

export async function getConversation(id) {
  const user = currentUser();
  const c = db.conversations.find((x) => x.id === id);
  const role = c && roleIn(user, c);
  if (!role) throw new ApiError(404, 'Conversation not found');
  c.unread[role] = 0;
  return copy({ ...conversationView(c, role), messages: c.messages });
}

export async function sendMessage(id, body) {
  const user = currentUser();
  const c = db.conversations.find((x) => x.id === id);
  const role = c && roleIn(user, c);
  if (!role) throw new ApiError(404, 'Conversation not found');
  addMessage(c, role, body);
  return { ok: true };
}

// ----- Promotions -----
export const sellerCoupons = async () => copy(db.coupons.filter((c) => c.shopId === myShop().id));
export async function createCoupon({ code, kind, value, minSpend = 0, maxUses, endsAt }) {
  const coupon = {
    id: `cpn_${db.coupons.length + 1}`,
    shopId: myShop().id,
    code: code.toUpperCase(),
    kind,
    value: Number(value),
    minSpend: Number(minSpend) || 0,
    maxUses: maxUses ? Number(maxUses) : null,
    uses: 0,
    endsAt: endsAt || null,
    active: true,
    expired: false,
  };
  db.coupons.push(coupon);
  return copy(coupon);
}
export async function setCouponActive(id, active) {
  const c = db.coupons.find((x) => x.id === id && x.shopId === myShop().id);
  c.active = active;
  return copy(c);
}
export async function featureProduct(id) {
  const p = db.products.find((x) => x.id === id && x.shopId === myShop().id);
  p.featuredUntil = new Date(Date.now() + 7 * 864e5).toISOString();
  return copy(p);
}
export async function unfeatureProduct(id) {
  const p = db.products.find((x) => x.id === id && x.shopId === myShop().id);
  p.featuredUntil = null;
  return copy(p);
}

// ----- Price requests -----
const requestView = (r) => {
  const product = db.products.find((p) => p.id === r.productId);
  const buyer = db.users.find((u) => u.id === r.buyerId);
  return {
    ...r,
    productName: product.name,
    productPrice: product.price,
    shopName: db.shops.find((x) => x.id === r.shopId).name,
    buyerName: buyer.name,
    buyerPhone: buyer.phone,
  };
};
export async function requestPrice({ productId, qty, options = {}, targetPrice, note = '', province, town }) {
  const user = currentUser();
  const product = db.products.find((p) => p.id === productId);
  const r = {
    id: `prq_${db.priceRequests.length + 1}`,
    productId,
    shopId: product.shopId,
    buyerId: user.id,
    qty: Number(qty),
    options,
    targetPrice: targetPrice ? Number(targetPrice) : null,
    note,
    province,
    town,
    status: 'open',
    quotedPrice: null,
    sellerNote: null,
    validUntil: null,
    date: new Date().toISOString(),
  };
  db.priceRequests.push(r);
  return copy(requestView(r));
}
export const myPriceRequests = async () =>
  copy(db.priceRequests.filter((r) => r.buyerId === currentUser().id).map(requestView));
export const shopPriceRequests = async () =>
  copy(db.priceRequests.filter((r) => r.shopId === myShop().id).map(requestView));
export async function respondToPriceRequest(id, body) {
  const r = db.priceRequests.find((x) => x.id === id && x.shopId === myShop().id && x.status === 'open');
  if (!r) throw new ApiError(409, 'This request has already been answered');
  if (body.decline) Object.assign(r, { status: 'declined', sellerNote: body.note ?? '' });
  else
    Object.assign(r, {
      status: 'quoted',
      quotedPrice: Number(body.price),
      sellerNote: body.note ?? '',
      validUntil: new Date(Date.now() + (body.validDays ?? 3) * 864e5).toISOString(),
    });
  return copy(requestView(r));
}
export async function acceptPriceRequest(id) {
  const r = db.priceRequests.find((x) => x.id === id && x.buyerId === currentUser().id);
  if (!r || r.status !== 'quoted') throw new ApiError(409, 'There is no price to accept yet');
  r.status = 'accepted';
  return copy(requestView(r));
}

// ----- Statements and personal data -----
export async function sellerStatement(month) {
  myShop();
  return {
    month,
    commissionRate: 0.05,
    shop: copy(myShop()),
    lines: [],
    totals: { subtotal: 0, discount: 0, delivery: 0, commission: 0, payout: 0 },
  };
}
export async function exportMyData() {
  const user = currentUser();
  return copy({ user, orders: db.orders.filter((o) => o.buyerId === user.id) });
}
export async function deleteAccount() {
  const user = currentUser();
  if (user.shopId)
    throw new ApiError(409, 'Close your shop before deleting your account. Contact support to close it.');
  db.users = db.users.filter((u) => u.id !== user.id);
  Object.keys(db.sessions).forEach((t) => db.sessions[t] === user.id && delete db.sessions[t]);
  return { ok: true };
}
