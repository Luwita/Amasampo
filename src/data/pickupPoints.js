// Zed Market Points: collection points where buyers pick up parcels sent by any shop.
// These are EXAMPLES for development only, and are never offered on the live site. Staff enter the real partner
// outlets in Admin → Delivery; the saved list replaces this one through applyPointConfig().
const EXAMPLE_POINTS = [
  { id: 'lsk-cairo', province: 'lusaka', town: 'Lusaka', name: 'Zed Market Point Cairo Road', address: 'Cairo Road, town centre', hours: 'Mon–Sat 08:00–18:00' },
  { id: 'lsk-east', province: 'lusaka', town: 'Lusaka', name: 'Zed Market Point Great East Road', address: 'Great East Road', hours: 'Mon–Sat 08:00–18:00' },
  { id: 'kafue', province: 'lusaka', town: 'Kafue', name: 'Zed Market Point Kafue', address: 'Town centre', hours: 'Mon–Sat 08:00–17:00' },
  { id: 'kitwe', province: 'copperbelt', town: 'Kitwe', name: 'Zed Market Point Kitwe', address: 'Town centre', hours: 'Mon–Sat 08:00–18:00' },
  { id: 'ndola', province: 'copperbelt', town: 'Ndola', name: 'Zed Market Point Ndola', address: 'Town centre', hours: 'Mon–Sat 08:00–18:00' },
  { id: 'chingola', province: 'copperbelt', town: 'Chingola', name: 'Zed Market Point Chingola', address: 'Town centre', hours: 'Mon–Sat 08:00–17:00' },
  { id: 'kabwe', province: 'central', town: 'Kabwe', name: 'Zed Market Point Kabwe', address: 'Town centre', hours: 'Mon–Sat 08:00–17:00' },
  { id: 'livingstone', province: 'southern', town: 'Livingstone', name: 'Zed Market Point Livingstone', address: 'Town centre', hours: 'Mon–Sat 08:00–17:00' },
  { id: 'choma', province: 'southern', town: 'Choma', name: 'Zed Market Point Choma', address: 'Town centre', hours: 'Mon–Sat 08:00–17:00' },
  { id: 'chipata', province: 'eastern', town: 'Chipata', name: 'Zed Market Point Chipata', address: 'Town centre', hours: 'Mon–Sat 08:00–17:00' },
  { id: 'kasama', province: 'northern', town: 'Kasama', name: 'Zed Market Point Kasama', address: 'Town centre', hours: 'Mon–Sat 08:00–17:00' },
  { id: 'chinsali', province: 'muchinga', town: 'Chinsali', name: 'Zed Market Point Chinsali', address: 'Town centre', hours: 'Mon–Sat 08:00–17:00' },
  { id: 'mansa', province: 'luapula', town: 'Mansa', name: 'Zed Market Point Mansa', address: 'Town centre', hours: 'Mon–Sat 08:00–17:00' },
  { id: 'solwezi', province: 'northwestern', town: 'Solwezi', name: 'Zed Market Point Solwezi', address: 'Town centre', hours: 'Mon–Sat 08:00–17:00' },
  { id: 'mongu', province: 'western', town: 'Mongu', name: 'Zed Market Point Mongu', address: 'Town centre', hours: 'Mon–Sat 08:00–17:00' },
];

export const pickupPoints = [];

// Uses the saved list of points. While nothing has been saved, development shows the examples and the live
// site offers no points at all, so no buyer is sent to a place that doesn't exist. Updated in place for every import.
const LIVE = typeof process !== 'undefined' && process.env.NODE_ENV === 'production';
export function applyPointConfig(saved = null) {
  const list = saved ?? (LIVE ? [] : EXAMPLE_POINTS.map((p) => ({ ...p, example: true })));
  pickupPoints.splice(0, pickupPoints.length, ...list.map((p) => ({ active: true, ...p })));
}
applyPointConfig();

export const pointsIn = ({ province, town }) =>
  pickupPoints.filter((p) => p.active && p.province === province && p.town === town);
export const getPickupPoint = (id) => pickupPoints.find((p) => p.id === id && p.active);
export const describePoint = (p) => `${p.name}, ${p.address}, ${p.town}`;
