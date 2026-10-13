import { pointsIn } from './pickupPoints.js';

// Zambian delivery options a shop can offer, with fees (ZMW) and times per distance band.
// The values below are only starting points: staff enter the rates agreed with each courier in
// Admin → Delivery, which are saved in the database and applied with applyCourierConfig().
//   town     = seller and buyer in the same town
//   province = same province, different town
//   national = different provinces
// Base rates cover a parcel up to INCLUDED_KG; heavier parcels pay `perKg` for every extra kg.
// `maxKg` is the heaviest parcel a courier accepts (no limit when missing).
export const INCLUDED_KG = 5;

export const couriers = [
  {
    id: 'pickup',
    name: 'Collect from shop',
    icon: '🏪',
    description: 'Buyer collects the order in person at the shop.',
    rates: { town: 0, province: 0, national: 0 },
    eta: { town: 'Ready in 2 hours', province: 'Ready in 2 hours', national: 'Ready in 2 hours' },
    cod: true,
  },
  {
    id: 'seller',
    name: "Shop's own delivery",
    icon: '🛵',
    description: "Delivered by the shop's own rider or vehicle.",
    rates: { town: 30, province: 90 },
    perKg: { town: 1, province: 3 },
    eta: { town: 'Same day', province: '1–2 days' },
    cod: true,
  },
  {
    id: 'yango',
    name: 'Yango Delivery',
    icon: '🟡',
    description: 'On-demand courier for deliveries within the same town.',
    rates: { town: 45 },
    perKg: { town: 5 },
    maxKg: 20, // motorbike and car deliveries
    eta: { town: '1–3 hours' },
    // Towns where same-town on-demand delivery is offered. Keep in line with Yango's current coverage.
    towns: ['Lusaka', 'Ndola', 'Kitwe', 'Livingstone', 'Kabwe', 'Chingola'],
    cod: true,
  },
  {
    id: 'platinum',
    name: 'Platinum Couriers',
    icon: '📦',
    description: 'Door-to-door parcel delivery between towns and provinces.',
    rates: { town: 60, province: 95, national: 160 },
    perKg: { town: 3, province: 5, national: 8 },
    maxKg: 100,
    eta: { town: 'Same day', province: '1–2 days', national: '2–3 days' },
    cod: true,
  },
  {
    id: 'bus',
    name: 'Intercity bus parcel',
    icon: '🚌',
    description: 'Sent with intercity bus parcel services; buyer collects at the bus station.',
    rates: { province: 60, national: 90 },
    perKg: { province: 2, national: 3 },
    maxKg: 300,
    eta: { province: 'Next day', national: '1–2 days' },
    cod: false,
  },
  {
    id: 'zampost',
    name: 'Zampost EMS',
    icon: '✉️',
    description: 'National postal courier reaching every district post office.',
    rates: { town: 50, province: 75, national: 120 },
    perKg: { town: 4, province: 6, national: 9 },
    maxKg: 30,
    eta: { town: '1–2 days', province: '2–3 days', national: '3–5 days' },
    cod: false,
  },
  {
    // Offered for every shop: the shop sends the parcel to a Zed Market Point in the buyer's town.
    id: 'point',
    name: 'Zed Market Point',
    icon: '📍',
    description: "Your parcel waits at a Zed Market collection point in your town. Collect it with your order number.",
    rates: { town: 20, province: 55, national: 90 },
    perKg: { town: 1, province: 3, national: 4 },
    maxKg: 60,
    eta: { town: 'Next day', province: '1–3 days', national: '2–5 days' },
    cod: true,
    network: true,
  },
];

// Fields staff can change in Admin → Delivery. Everything else (id, icon, how a courier works) stays in code.
export const EDITABLE_COURIER_FIELDS = ['description', 'rates', 'perKg', 'maxKg', 'eta', 'towns', 'cod', 'disabled'];
const DEFAULT_COURIERS = JSON.parse(JSON.stringify(couriers));

// Replaces the editable fields with saved values (or the defaults for couriers with nothing saved).
// The courier objects are updated in place so every import sees the new rates.
export function applyCourierConfig(saved = {}) {
  for (const courier of couriers) {
    const base = DEFAULT_COURIERS.find((d) => d.id === courier.id);
    const override = saved[courier.id];
    for (const key of EDITABLE_COURIER_FIELDS) {
      const value = override && key in override ? override[key] : base[key];
      if (value === undefined) delete courier[key];
      else courier[key] = JSON.parse(JSON.stringify(value));
    }
    courier.confirmed = !!override;
  }
}
applyCourierConfig();

export const getCourier = (id) => couriers.find((c) => c.id === id);

// Options a shop chooses itself (Zed Market Points are offered for every shop).
export const shopCouriers = couriers.filter((c) => !c.network);
// Delivery options shown to shops and buyers (a courier staff switched off is hidden).
export const activeCouriers = () => couriers.filter((c) => !c.disabled);

// Every delivery option open for a shop's parcels: its own choices plus the Zed Market network.
export const offeredBy = (shop) => [...new Set([...shop.couriers, ...couriers.filter((c) => c.network).map((c) => c.id)])];

export function band(from, to) {
  if (from.province === to.province && from.town === to.town) return 'town';
  if (from.province === to.province) return 'province';
  return 'national';
}

export const bandRank = { town: 0, province: 1, national: 2 };

// Price and time for one courier taking a parcel of `weightKg` from a shop to a buyer, or null if not offered.
export function quote(courierId, shop, to, weightKg = 1) {
  const courier = getCourier(courierId);
  if (!courier || courier.disabled) return null;
  const b = band(shop, to);
  if (courier.towns && (b !== 'town' || !courier.towns.includes(shop.town))) return null;
  if (courier.maxKg && weightKg > courier.maxKg) return null;
  if (courier.id === 'point' && !pointsIn(to).length) return null;
  const rates = courier.id === 'seller' && shop.ownRates ? { ...courier.rates, ...shop.ownRates } : courier.rates;
  if (rates[b] === undefined || rates[b] === null || rates[b] === '') return null;
  const extraKg = Math.max(0, Math.ceil(weightKg - INCLUDED_KG));
  const fee = Number(rates[b]) + extraKg * (courier.perKg?.[b] ?? 0);
  return { courier, fee, eta: courier.eta[b], band: b, weightKg };
}

// All options a shop offers to a buyer location for a parcel weight, cheapest first.
export function quotesFor(shop, to, weightKg = 1) {
  return offeredBy(shop)
    .map((id) => quote(id, shop, to, weightKg))
    .filter(Boolean)
    .sort((a, b) => a.fee - b.fee);
}

// Cheapest option that actually brings the parcel to the buyer (excludes collecting from the shop).
export const bestDelivery = (shop, to, weightKg = 1) =>
  quotesFor(shop, to, weightKg).find((q) => q.courier.id !== 'pickup') ?? null;

// Couriers that can't take a parcel this heavy, for explaining missing options.
export const tooHeavyFor = (shop, weightKg) =>
  offeredBy(shop)
    .map(getCourier)
    .filter((c) => c && !c.disabled && c.maxKg && weightKg > c.maxKg);

export const formatKg = (kg) => (kg >= 10 ? `${Math.round(kg)} kg` : `${Number(kg.toFixed(1))} kg`);
