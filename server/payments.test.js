import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { createApp } from './app.js';
import { createDb, migrate } from './db.js';
import { smsText } from './notify.js';

let server;
let base;
let db;
const sent = [];
let smsDown = false;

async function api(method, url, body, token) {
  const res = await fetch(base + url, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function signIn(phone, extra = {}) {
  await api('POST', '/api/auth/request-code', { phone });
  const code = sent.at(-1).message.match(/\d{6}/)[0];
  const res = await api('POST', '/api/auth/verify', { phone, code, ...extra });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
}

const shopBody = {
  name: 'Mutinta Appliances',
  ownerFullName: 'Mutinta Hamoonga',
  nrc: '123456/78/1',
  phone: '0977100100',
  province: 'lusaka',
  town: 'Lusaka',
  area: 'Cairo Road',
  couriers: ['pickup', 'seller'],
  momoNetwork: 'airtel',
  momoNumber: '097 755 5123',
  momoName: 'Mutinta Hamoonga',
};
const shipping = { name: 'Chipo Zulu', phone: '0966200200', province: 'lusaka', town: 'Lusaka', address: 'Plot 5' };

let admin;
let seller;
let buyer;
let fanId;
const order = (payment, extra = {}) =>
  api(
    'POST',
    '/api/orders',
    { items: [{ productId: fanId, qty: 1 }], shipping, couriers: { [seller.shopId]: 'pickup' }, payment, ...extra },
    buyer.token,
  );
const parcel = (id, path, body, token) => api('POST', `/api/orders/${id}/shipments/${seller.shopId}/${path}`, body, token);
const textsTo = (phone) => sent.filter((m) => m.phone === phone).map((m) => m.message);

before(async () => {
  db = await createDb({ url: '', dataDir: '' });
  await migrate(db);
  server = createApp(db, {
    uploadDir: '.',
    adminPhones: ['0955000001'],
    sms: {
      provider: "Africa's Talking",
      async send(phone, message) {
        if (smsDown) throw new Error('provider unreachable');
        sent.push({ phone, message });
      },
    },
  }).listen(0);
  base = `http://localhost:${server.address().port}`;

  admin = await signIn('0955000001');
  seller = await signIn('0977100100', { name: 'Mutinta' });
  buyer = await signIn('0966200200', { name: 'Chipo' });
});

after(async () => {
  server.close();
  await db.close();
});

describe('Mobile Money paid straight to the shop', () => {
  test('a shop must give its Mobile Money number, which only its owner and staff can see', async () => {
    const { momoNumber, ...without } = shopBody;
    const refused = await api('POST', '/api/shops', without, seller.token);
    assert.equal(refused.status, 400);
    assert.match(refused.body.error, /Mobile Money number/);

    const created = await api('POST', '/api/shops', shopBody, seller.token);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.momoNumber, '0977555123');
    seller.shopId = created.body.id;
    await api('PATCH', `/api/admin/shops/${seller.shopId}/verification`, { status: 'verified' }, admin.token);

    const forBuyers = (await api('GET', `/api/shops/${seller.shopId}`)).body;
    assert.equal(forBuyers.takesMomo, true);
    assert.equal(forBuyers.momoNumber, undefined, 'the number is not on the public shop page');
    assert.equal(JSON.stringify((await api('GET', '/api/shops')).body).includes('977555123'), false);
    assert.equal((await api('GET', `/api/shops/${seller.shopId}`, undefined, seller.token)).body.momoName, 'Mutinta Hamoonga');
    assert.equal((await api('GET', `/api/admin/shops/${seller.shopId}`, undefined, admin.token)).body.momoNetwork, 'airtel');

    const product = await api(
      'POST',
      '/api/products',
      { name: 'Standing Fan', category: 'home', price: 500, stock: 10 },
      seller.token,
    );
    fanId = product.body.id;
  });

  test('card and the old instant payments are gone', async () => {
    for (const payment of ['card', 'mtn']) assert.equal((await order(payment)).status, 400);
  });

  test('the buyer gets the number, says they paid, and the shop confirms before it can send', async () => {
    sent.length = 0;
    const placed = await order('momo');
    assert.equal(placed.status, 201, JSON.stringify(placed.body));
    const o = placed.body;
    assert.equal(o.payment, 'Mobile Money');
    assert.equal(o.payByMomo, true);
    assert.equal(o.paid, false);
    assert.equal(o.shipments[0].due, 500);
    assert.deepEqual(o.shipments[0].payTo, {
      network: 'airtel',
      networkName: 'Airtel Money',
      number: '0977555123',
      name: 'Mutinta Hamoonga',
    });

    // Both sides are told by text message as well as in the app.
    assert.match(textsTo('966200200')[0], /^Zed Market: Pay K500 to Airtel Money 0977555123\. Name: Mutinta Hamoonga\./);
    assert.match(textsTo('977100100')[0], /New order ZM-\w+\..*Wait for K500 on your Mobile Money/);
    assert.ok(sent.every((m) => m.message.length <= 160 && /^[\x20-\x7E]+$/.test(m.message)), 'one plain SMS each');

    // The parcel can't be sent before the money is confirmed.
    const url = `/api/orders/${o.id}/shipments/${seller.shopId}`;
    const early = await api('PATCH', url, { status: 'dispatched' }, seller.token);
    assert.equal(early.status, 409);
    assert.match(early.body.error, /Confirm the buyer's Mobile Money payment/);

    // Only the buyer can say they paid; only the shop can confirm.
    assert.equal((await parcel(o.id, 'payment-sent', {}, seller.token)).status, 404);
    assert.equal((await parcel(o.id, 'paid', {}, buyer.token)).status, 403);

    const claimed = await parcel(o.id, 'payment-sent', { reference: 'MP261013.1530.A12345' }, buyer.token);
    assert.equal(claimed.status, 200, JSON.stringify(claimed.body));
    assert.equal(claimed.body.shipments[0].paymentRef, 'MP261013.1530.A12345');
    assert.equal(claimed.body.shipments[0].paid, false, 'saying you paid does not mark the parcel paid');
    assert.match(textsTo('977100100').at(-1), /Payment sent for order .*Chipo Zulu says they sent K500.*MP261013/);

    const confirmed = await parcel(o.id, 'paid', {}, seller.token);
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    assert.equal(confirmed.body.shipments[0].paid, true);
    assert.equal(confirmed.body.paid, true);
    assert.match(textsTo('966200200').at(-1), /Mutinta Appliances received your payment/);
    assert.equal((await parcel(o.id, 'paid', {}, seller.token)).status, 409, 'confirmed once');

    assert.equal((await api('PATCH', url, { status: 'dispatched' }, seller.token)).status, 200);
    assert.match(textsTo('966200200').at(-1), /Ready to collect at Mutinta Appliances/);
    assert.equal((await api('PATCH', url, { status: 'delivered' }, seller.token)).status, 200);

    // The shop already has the money, so it owes Zed Market the 5% commission.
    const balance = (await api('GET', '/api/seller/payouts', undefined, seller.token)).body;
    assert.equal(balance.onHold, -25);
  });

  test('cancelling before the shop confirms records no refund; after it, the shop must send the money back', async () => {
    const unpaid = (await order('momo')).body;
    await parcel(unpaid.id, 'payment-sent', {}, buyer.token);
    const first = await parcel(unpaid.id, 'cancel', { reason: 'Changed my mind' }, buyer.token);
    assert.equal(first.body.refund, 0);

    const paid = (await order('momo')).body;
    await parcel(paid.id, 'paid', {}, seller.token);
    sent.length = 0;
    const second = await parcel(paid.id, 'cancel', { reason: 'Out of stock' }, seller.token);
    assert.equal(second.body.refund, 500);
    assert.match(textsTo('977100100')[0], /Send K500 back for order/);
    const [refund] = (await api('GET', '/api/admin/refunds?status=due', undefined, admin.token)).body;
    assert.equal(refund.amount, 500);
    assert.equal(refund.heldByShop, true);
    assert.equal((await parcel(paid.id, 'paid', {}, seller.token)).status, 409, 'a cancelled parcel cannot be paid');
  });

  test('pay on delivery needs no confirmation', async () => {
    const o = (await order('cod')).body;
    assert.equal(o.payByMomo, false);
    assert.equal(o.shipments[0].payTo, null);
    assert.equal((await parcel(o.id, 'paid', {}, seller.token)).status, 409);
    const url = `/api/orders/${o.id}/shipments/${seller.shopId}`;
    assert.equal((await api('PATCH', url, { status: 'dispatched' }, seller.token)).status, 200);
  });

  test('a shop without a number can only be paid on delivery, and staff see it on the launch list', async () => {
    await db.query('UPDATE shops SET momo_number = NULL WHERE id = $1', [seller.shopId]);
    const refused = await order('momo');
    assert.equal(refused.status, 409);
    assert.match(refused.body.error, /hasn't added a Mobile Money number yet/);
    assert.equal((await order('cod')).status, 201);

    const { setup } = (await api('GET', '/api/admin/stats', undefined, admin.token)).body;
    assert.equal(setup.shopsWithoutMomo, 1);
    assert.equal(setup.sms, 'live');
    assert.equal(setup.commissionSet, false);
    assert.equal(setup.pointsConfirmed, false);
    assert.ok(setup.couriersUnconfirmed.includes('Platinum Couriers'));
  });
});

describe('text messages for notifications', () => {
  test('texts are plain, start with the sender and fit one SMS', () => {
    assert.equal(smsText('🎉 Your shop is approved and live', 'Buyers can now find you.'), 'Zed Market: Your shop is approved and live. Buyers can now find you.');
    assert.equal(smsText('On its way', 'Yango · tracking 123 – “fast”'), 'Zed Market: On its way. Yango - tracking 123 - "fast"');
    assert.equal(smsText('You earned K50!', 'Thanks'), 'Zed Market: You earned K50! Thanks');
    const long = smsText('Order', 'x'.repeat(300));
    assert.equal(long.length, 160);
    assert.ok(long.endsWith('...'));
  });

  test('announcements and vouchers stay in the app; a failed text never breaks the request', async () => {
    sent.length = 0;
    const res = await api(
      'POST',
      '/api/admin/announcements',
      { title: 'Independence Day deals', body: 'Up to 30% off', audience: 'all', confirm: true },
      admin.token,
    );
    assert.ok(res.status < 300, JSON.stringify(res.body));
    assert.equal(sent.length, 0);

    smsDown = true;
    try {
      assert.equal((await order('cod')).status, 201, 'the order is placed even when the text cannot be sent');
    } finally {
      smsDown = false;
    }
  });
});

describe('commission owed by shops', () => {
  const balance = async () => (await api('GET', '/api/seller/payouts', undefined, seller.token)).body;
  const receive = (amount) =>
    api('POST', '/api/admin/commission', { shopId: seller.shopId, amount, method: 'mtn', reference: 'MP2610.7788' }, admin.token);
  const remind = () => api('POST', '/api/admin/commission/remind', { shopId: seller.shopId }, admin.token);

  test('a shop paid directly owes the commission once the return window has passed', async () => {
    assert.equal((await balance()).owed, 0, 'still on hold');
    await db.query(`UPDATE shipments SET delivered_at = now() - interval '8 days' WHERE status = 'delivered'`);
    const b = await balance();
    assert.equal(b.available, -25);
    assert.equal(b.owed, 25);
    assert.equal(b.payTo, null, 'staff have not said where to pay yet');
    assert.equal((await remind()).status, 409, 'no reminder before there is somewhere to pay');
  });

  test('owners set where shops pay; the shop sees it', async () => {
    const account = { network: 'mtn', number: '0966000111', name: 'Zed Market Ltd' };
    assert.equal((await api('PUT', '/api/admin/commission-account', account, seller.token)).status, 403);
    assert.equal((await api('PUT', '/api/admin/commission-account', account, admin.token)).status, 200);
    assert.deepEqual((await balance()).payTo, account);
    const { setup, commissionOwed, commissionOwedShops } = (await api('GET', '/api/admin/stats', undefined, admin.token)).body;
    assert.equal(setup.commissionAccountSet, true);
    assert.equal(commissionOwed, 25);
    assert.equal(commissionOwedShops, 1);
  });

  test('staff remind the shop, record what it pays, and never more than it owes', async () => {
    sent.length = 0;
    assert.equal((await remind()).status, 200);
    assert.match(textsTo('977100100')[0], /Please pay K25 commission\. Send it to MTN MoMo 0966000111 \(Zed Market Ltd\)/);

    const tooMuch = await receive(30);
    assert.equal(tooMuch.status, 409);
    assert.match(tooMuch.body.error, /only owes K25/);

    const part = await receive(10);
    assert.equal(part.status, 201, JSON.stringify(part.body));
    assert.equal(part.body.kind, 'commission');
    let b = await balance();
    assert.equal(b.owed, 15);
    assert.equal(b.commissionPaid, 10);
    assert.equal(b.paidOut, 0, 'commission received is not a payout to the shop');
    assert.match(textsTo('977100100').at(-1), /received your K10 commission.*You still owe K15/);

    assert.equal((await receive(15)).status, 201);
    b = await balance();
    assert.equal(b.owed, 0);
    assert.equal(b.available, 0);
    assert.deepEqual(b.history.map((h) => [h.kind, h.amount]), [
      ['commission', 15],
      ['commission', 10],
    ]);
    assert.equal((await remind()).status, 409, 'nothing left to ask for');
    assert.equal((await receive(1)).status, 409);
    const pay = await api('POST', '/api/admin/payouts', { shopId: seller.shopId, amount: 1, method: 'mtn', reference: 'MP1' }, admin.token);
    assert.equal(pay.status, 409, 'paying commission does not create money to pay out');
  });
});
