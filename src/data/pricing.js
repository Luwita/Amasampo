// Prices an order from the current catalogue. The server runs this as the source of truth,
// so totals never come from the buyer's browser.
import { unitPrice } from './catalog.js';
import { offeredBy, quote, tooHeavyFor, formatKg } from './couriers.js';
import { couponDiscount, splitDiscount } from './fees.js';
import { describePoint, getPickupPoint } from './pickupPoints.js';
import { checkChoice, describeChoice, lineKey } from './options.js';

export class OrderError extends Error {}

// lines:   [{ productId, qty, options, quoteId }]
// picks:   { [shopId]: courierId }, to: { province, town }
// coupons: { [shopId]: { code, kind, value, minSpend } } — codes already checked as valid for the buyer
// quotes:  { [quoteId]: { productId, qty, price } } — accepted, unexpired price requests of this buyer
// voucher: { amount, minSpend } — a Zed Market voucher of this buyer, already checked as unused and unexpired
// pickupPoint: id of the Zed Market Point chosen for parcels sent with the 'point' option
export function priceOrder({
  lines,
  getProduct,
  getShop,
  to,
  picks,
  payment,
  coupons = {},
  quotes = {},
  voucher = null,
  pickupPoint = null,
}) {
  // Merge repeated lines (same product, same choices, same agreed price).
  const merged = new Map();
  for (const { productId, qty, options = {}, quoteId } of lines) {
    const key = `${lineKey(productId, options)}|${quoteId ?? ''}`;
    const prev = merged.get(key);
    merged.set(key, { productId, options, quoteId, qty: (prev?.qty ?? 0) + qty });
  }
  if (!merged.size) throw new OrderError('Your cart is empty');

  // Stock counts every line of a product; wholesale tiers count the lines without an agreed price.
  const totals = new Map();
  const tierQty = new Map();
  for (const line of merged.values()) {
    const product = getProduct(line.productId);
    if (!product) throw new OrderError('A product in your cart is no longer available');
    const problem = checkChoice(product, line.options);
    if (problem) throw new OrderError(problem);
    if (line.quoteId) {
      const agreed = quotes[line.quoteId];
      if (!agreed || agreed.productId !== product.id) {
        throw new OrderError(`The agreed price for ${product.name} is no longer available`);
      }
      if (agreed.qty !== line.qty) {
        throw new OrderError(`The agreed price for ${product.name} is for exactly ${agreed.qty} units`);
      }
    } else {
      tierQty.set(product.id, (tierQty.get(product.id) ?? 0) + line.qty);
    }
    totals.set(product.id, (totals.get(product.id) ?? 0) + line.qty);
  }
  for (const [productId, qty] of totals) {
    const product = getProduct(productId);
    if (product.stock < qty) {
      throw new OrderError(
        product.stock ? `Only ${product.stock} × ${product.name} left in stock` : `${product.name} is sold out`,
      );
    }
  }

  const byShop = new Map();
  for (const line of merged.values()) {
    const product = getProduct(line.productId);
    const group = byShop.get(product.shopId) ?? { items: [], weightKg: 0 };
    group.items.push({
      id: product.id,
      name: product.name,
      options: describeChoice(line.options),
      qty: line.qty,
      price: line.quoteId ? quotes[line.quoteId].price : unitPrice(product, tierQty.get(product.id)),
      quoteId: line.quoteId ?? null,
    });
    group.weightKg += line.qty * (product.weightKg ?? 1);
    byShop.set(product.shopId, group);
  }

  const shipments = [...byShop].map(([shopId, { items, weightKg }]) => {
    const shop = getShop(shopId);
    const pick = picks?.[shopId];
    // Only options this shop actually offers (plus the Zed Market network) can be chosen.
    const q = shop && offeredBy(shop).includes(pick) && quote(pick, shop, to, weightKg);
    if (!q) {
      const heavy = shop ? tooHeavyFor(shop, weightKg).find((c) => c.id === picks?.[shopId]) : null;
      throw new OrderError(
        heavy
          ? `${heavy.name} can't carry ${formatKg(weightKg)}. Choose another delivery option for ${shop.name}`
          : `Choose a delivery option ${shop ? `for ${shop.name} ` : ''}that reaches ${to.town}`,
      );
    }
    if (payment === 'cod' && !q.courier.cod) {
      throw new OrderError(`Pay on Delivery isn't available with ${q.courier.name}`);
    }
    let point = null;
    if (q.courier.id === 'point') {
      point = getPickupPoint(pickupPoint);
      if (!point || point.province !== to.province || point.town !== to.town) {
        throw new OrderError(`Choose the Zed Market Point in ${to.town} where you will collect your parcel`);
      }
    }
    const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
    let discount = 0;
    const coupon = coupons[shopId];
    if (coupon) {
      const result = couponDiscount(coupon, subtotal);
      if (result.problem) throw new OrderError(result.problem);
      discount = result.discount;
    }
    return {
      shopId,
      shopName: shop.name,
      items,
      weightKg,
      subtotal,
      discount,
      couponCode: coupon ? coupon.code : null,
      courier: q.courier.id,
      courierName: q.courier.name,
      fee: q.fee,
      eta: q.eta,
      pickupPoint: point ? describePoint(point) : null,
      voucherDiscount: 0,
    };
  });

  const subtotal = shipments.reduce((sum, s) => sum + s.subtotal, 0);
  const discount = shipments.reduce((sum, s) => sum + s.discount, 0);
  const delivery = shipments.reduce((sum, s) => sum + s.fee, 0);

  // A Zed Market voucher comes off the goods, shared across the parcels.
  let voucherDiscount = 0;
  if (voucher) {
    const goods = shipments.map((s) => s.subtotal - s.discount);
    const goodsTotal = goods.reduce((n, v) => n + v, 0);
    if (goodsTotal < voucher.minSpend) {
      throw new OrderError(`Spend at least K${voucher.minSpend} on products to use this voucher`);
    }
    voucherDiscount = Math.min(voucher.amount, goodsTotal);
    splitDiscount(voucherDiscount, goods).forEach((part, i) => (shipments[i].voucherDiscount = part));
  }

  return {
    shipments,
    subtotal,
    discount,
    voucherDiscount,
    delivery,
    total: subtotal - discount - voucherDiscount + delivery,
  };
}

// Parcel weight per shop for a set of cart lines, used to show delivery prices before checkout.
export const parcelWeight = (lines) => lines.reduce((kg, l) => kg + l.qty * (l.product.weightKg ?? 1), 0);
