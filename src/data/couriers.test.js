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
  expect(bestDelivery(kitweShop, to).courier.id).toBe('bus');
});

test('heavier parcels pay per extra kg and couriers refuse loads over their limit', () => {
  const lusaka = { province: 'lusaka', town: 'Lusaka', couriers: ['yango', 'platinum', 'zampost'] };
  const here = { province: 'lusaka', town: 'Lusaka' };
  expect(quote('platinum', lusaka, here, 5).fee).toBe(60); // base rate covers 5 kg
  expect(quote('platinum', lusaka, here, 5.2).fee).toBe(63); // rounds up to 1 extra kg × K3
  expect(quote('yango', lusaka, here, 20)).not.toBeNull();
  expect(quote('yango', lusaka, here, 21)).toBeNull(); // over Yango's 20 kg limit
  // Zed Market Points are off by default, so only Platinum takes 40 kg here.
  expect(quotesFor(lusaka, here, 40).map((q) => q.courier.id)).toEqual(['platinum']);
});
