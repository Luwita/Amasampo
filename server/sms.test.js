import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { createApp } from './app.js';
import { createDb, migrate } from './db.js';
import { africasTalkingSms, consoleSms, smsFromEnv } from './sms.js';

// A stand-in for fetch that records the request and answers like Africa's Talking.
function fakeFetch(reply) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, form: Object.fromEntries(new URLSearchParams(init.body.toString())) });
    if (reply instanceof Error) throw reply;
    return new Response(typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body), { status: reply.status ?? 201 });
  };
  fn.calls = calls;
  return fn;
}
const accepted = {
  body: {
    SMSMessageData: {
      Message: 'Sent to 1/1 Total Cost: ZMW 0.3000',
      Recipients: [{ statusCode: 101, number: '+260977123456', status: 'Success', cost: 'ZMW 0.3000', messageId: 'ATXid_1' }],
    },
  },
};

describe("Africa's Talking SMS", () => {
  test('sends to the Zambian number with the API key, username and sender ID', async () => {
    const fetchImpl = fakeFetch(accepted);
    const sms = africasTalkingSms({ username: 'zedmarket', apiKey: 'key123', senderId: 'ZedMarket', fetchImpl });
    const result = await sms.send('977123456', 'Your Zed Market code is 123456.');
    assert.deepEqual(result, { id: 'ATXid_1', cost: 'ZMW 0.3000' });
    const [call] = fetchImpl.calls;
    assert.equal(call.url, 'https://api.africastalking.com/version1/messaging');
    assert.equal(call.init.headers.apiKey, 'key123');
    assert.deepEqual(call.form, { username: 'zedmarket', to: '+260977123456', message: 'Your Zed Market code is 123456.', from: 'ZedMarket' });
  });

  test('the sandbox username uses the sandbox and no sender ID is needed', async () => {
    const fetchImpl = fakeFetch(accepted);
    await africasTalkingSms({ username: 'sandbox', apiKey: 'k', fetchImpl }).send('966000111', 'Hi');
    assert.equal(fetchImpl.calls[0].url, 'https://api.sandbox.africastalking.com/version1/messaging');
    assert.equal(fetchImpl.calls[0].form.from, undefined);
  });

  test('a refused message, a wrong API key or no connection is reported as not sent', async () => {
    const refused = { body: { SMSMessageData: { Recipients: [{ statusCode: 403, status: 'InvalidPhoneNumber' }] } } };
    const wrongKey = { status: 401, body: 'The supplied authentication is invalid' };
    for (const reply of [refused, wrongKey, new Error('getaddrinfo ENOTFOUND')]) {
      const sms = africasTalkingSms({ username: 'zedmarket', apiKey: 'k', fetchImpl: fakeFetch(reply) });
      await assert.rejects(sms.send('977123456', 'Hi'), (err) => err.status === 502 && /couldn't send the SMS/.test(err.message));
    }
  });

  test('server/.env decides the provider', () => {
    assert.equal(smsFromEnv({}), consoleSms);
    assert.equal(smsFromEnv({ AT_USERNAME: 'sandbox', AT_API_KEY: 'k' }).provider, "Africa's Talking (sandbox)");
  });
});

describe('sign-in when the SMS cannot be sent', () => {
  let db;
  let server;
  let base;
  before(async () => {
    db = await createDb({ url: '', dataDir: '' });
    await migrate(db);
    const down = africasTalkingSms({ username: 'zedmarket', apiKey: 'k', fetchImpl: fakeFetch(new Error('offline')) });
    server = createApp(db, { uploadDir: '.', sms: down }).listen(0);
    base = `http://localhost:${server.address().port}`;
  });
  after(async () => {
    server.close();
    await db.close();
  });

  test('the person sees a clear message and can try again straight away', async () => {
    const ask = () =>
      fetch(`${base}/api/auth/request-code`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: '0977123456' }),
      }).then(async (r) => ({ status: r.status, body: await r.json() }));
    const first = await ask();
    assert.equal(first.status, 502);
    assert.match(first.body.error, /couldn't send the SMS/);
    assert.equal((await ask()).status, 502, 'not blocked by the 30-second wait');
  });
});

describe('sign-in in development when the SMS cannot be sent', () => {
  let db;
  let server;
  let base;
  before(async () => {
    db = await createDb({ url: '', dataDir: '' });
    await migrate(db);
    const down = africasTalkingSms({ username: 'sandbox', apiKey: 'wrong', fetchImpl: fakeFetch({ status: 401, body: 'The supplied authentication is invalid' }) });
    server = createApp(db, { uploadDir: '.', sms: down, exposeCodes: true }).listen(0);
    base = `http://localhost:${server.address().port}`;
  });
  after(async () => {
    server.close();
    await db.close();
  });

  test('the code is still shown on screen, so developers can sign in', async () => {
    const res = await fetch(`${base}/api/auth/request-code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '0977123456' }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.sent, false);
    assert.match(body.devCode, /^\d{6}$/);
  });
});
