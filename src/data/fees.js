// Platform settings shared by the app and the server.

// Amasampo's commission on goods sold (after discounts, excluding delivery). Placeholder: set your real rate.
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
