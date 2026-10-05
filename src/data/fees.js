// Platform settings shared by the app and the server.

// Zed Market's commission on goods sold (after discounts, excluding delivery). Placeholder: set your real rate.
export const COMMISSION_RATE = 0.05;

// Zambian standard VAT rate, used to show the VAT included in a VAT-registered shop's prices.
export const VAT_RATE = 0.16;

// Featured listings: how many products a shop can feature at once, and for how long.
export const FEATURED_LIMIT = 3;
export const FEATURED_DAYS = 7;

export const round2 = (n) => Math.round(n * 100) / 100;

// VAT contained in a VAT-inclusive amount.
export const vatIncluded = (amount) => round2((amount * VAT_RATE) / (1 + VAT_RATE));

// What a discount code takes off a shop's parcel, or an explanation of why it can't be used.
export function couponDiscount(coupon, subtotal) {
  if (subtotal < coupon.minSpend) {
    return { discount: 0, problem: `Spend at least K${coupon.minSpend} to use ${coupon.code}` };
  }
  const raw = coupon.kind === 'percent' ? (subtotal * coupon.value) / 100 : coupon.value;
  return { discount: round2(Math.min(raw, subtotal)), problem: null };
}

// Invite codes: a new user who signs up with a friend's code gets a welcome voucher; the friend gets a reward
// voucher once the new user's first order is delivered. Vouchers are paid for by Zed Market, not the shops.
export const WELCOME_VOUCHER = 50;
export const REFERRAL_REWARD = 50;
export const VOUCHER_MIN_SPEND = 300;
export const VOUCHER_DAYS = 60;

// Splits an order-level discount across parcels in proportion to their goods value (last parcel takes the rounding).
export function splitDiscount(amount, goodsValues) {
  const total = goodsValues.reduce((n, v) => n + v, 0);
  let left = amount;
  return goodsValues.map((v, i) => {
    if (i === goodsValues.length - 1) return round2(left);
    const part = total ? round2((amount * v) / total) : 0;
    left -= part;
    return part;
  });
}
