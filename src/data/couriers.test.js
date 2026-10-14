import { band, bestDelivery, quote, quotesFor } from './couriers';

const kitweShop = { province: 'copperbelt', town: 'Kitwe', couriers: ['pickup', 'seller', 'yango', 'platinum', 'bus'] };

test('distance band between shop and buyer', () => {
  expect(band(kitweShop, { province: 'copperbelt', town: 'Kitwe' })).toBe('town');
  expect(band(kitweShop, { province: 'copperbelt', town: 'Ndola' })).toBe('province');
  expect(band(kitweShop, { province: 'lusaka', town: 'Lusaka' })).toBe('national');
});

test('Yango only delivers within the same town, in covered towns', () => {
  expect(quote('yango', kitweShop, { province: 'copperbelt', town: 'Kitwe' })).not.toBeNull();
  expect(quote('yango', kitweShop, { province: 'copperbelt', town: 'Ndola' })).toBeNull();
  const mansaShop = { province: 'luapula', town: 'Mansa', couriers: ['yango'] };
  expect(quote('yango', mansaShop, { province: 'luapula', town: 'Mansa' })).toBeNull();
});

test("shop's own delivery uses the shop's rates and skips other provinces", () => {
  const shop = { ...kitweShop, ownRates: { town: 20, province: '' } };
  expect(quote('seller', shop, { province: 'copperbelt', town: 'Kitwe' }).fee).toBe(20);
  expect(quote('seller', shop, { province: 'copperbelt', town: 'Ndola' })).toBeNull();
  expect(quote('seller', shop, { province: 'lusaka', town: 'Lusaka' })).toBeNull();
});

test('quotes are cheapest first and best delivery excludes collection', () => {
  const to = { province: 'lusaka', town: 'Lusaka' };
  const fees = quotesFor(kitweShop, to).map((q) => q.fee);
  expect(fees).toEqual([...fees].sort((a, b) => a - b));
  expect(bestDelivery(kitweShop, to).courier.id).toBe('platinum'); // K30 across Zambia, cheaper than the bus
});

test('heavier parcels pay per extra kg and couriers refuse loads over their limit', () => {
  const lusaka = { province: 'lusaka', town: 'Lusaka', couriers: ['yango', 'platinum', 'zampost'] };
  const here = { province: 'lusaka', town: 'Lusaka' };
  expect(quote('platinum', lusaka, here, 5).fee).toBe(30); // base rate covers 5 kg
  expect(quote('platinum', lusaka, here, 5.2).fee).toBe(33); // rounds up to 1 extra kg × K3
  expect(quote('yango', lusaka, here, 20)).not.toBeNull();
  expect(quote('yango', lusaka, here, 21)).toBeNull(); // over Yango's 20 kg limit
  // Zed Market Points are off by default, so only Platinum takes 40 kg here.
  expect(quotesFor(lusaka, here, 40).map((q) => q.courier.id)).toEqual(['platinum']);
});

test('Yango is priced by distance like its own app, by motorbike or car', () => {
  const shop = { province: 'lusaka', town: 'Lusaka', couriers: ['yango'], lat: -15.4167, lng: 28.2833 };
  const here = { province: 'lusaka', town: 'Lusaka' };
  const near = { ...here, lat: -15.4467, lng: 28.2833 }; // 3.3 km in a straight line, 4.3 km by road
  const pick = (q) => q && { fee: q.fee, km: q.km, estimated: q.estimated, vehicle: q.vehicle };
  // No buyer position: a typical 8 km trip, shown as an estimate. K10.17 + 7 km × K4.95, rounded up.
  expect(pick(quote('yango', shop, here, 2))).toEqual({ fee: 45, km: 8, estimated: true, vehicle: 'moto' });
  // Both positions known: K10.17 + 3.3 km × K4.95.
  expect(pick(quote('yango', shop, near, 2))).toEqual({ fee: 27, km: 4.3, estimated: false, vehicle: 'moto' });
  // Over 10 kg goes by car: K19 + 2.8 km × K4.2 + about 10 minutes × K0.8.
  expect(pick(quote('yango', shop, near, 15))).toEqual({ fee: 40, km: 4.3, estimated: false, vehicle: 'car' });
  // Only in towns Yango covers.
  expect(quote('yango', { ...shop, province: 'central', town: 'Kabwe' }, { province: 'central', town: 'Kabwe' }, 2)).toBeNull();
});
