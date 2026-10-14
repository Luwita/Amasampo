import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from './app.js';
import { createDb, migrate } from './db.js';

// Owners by email: on the live site only once Neon Auth has verified the address, so nobody can become an owner
// by signing up with the owner's email before they do.
let db;
let server;
let base;
const people = {
  'tok-unverified': { id: 'auth-a', email: 'Owner@ZedMarket.co.zm', emailVerified: false, name: 'Impostor' },
  'tok-verified': { id: 'auth-b', email: 'owner@zedmarket.co.zm', emailVerified: true, name: 'Owner' },
};

before(async () => {
  db = await createDb({ url: '', dataDir: '' });
  await migrate(db);
  server = createApp(db, {
    uploadDir: '.',
    production: true,
    adminEmails: ['owner@zedmarket.co.zm'],
    auth: { verifyToken: async (t) => people[t] ?? null, lookupPhone: async () => null, verifyWebhook: async () => false },
  }).listen(0);
  base = `http://localhost:${server.address().port}`;
});
after(async () => {
  server.close();
  await db.close();
});

const me = async (token) => (await fetch(`${base}/api/session/me`, { headers: { authorization: `Bearer ${token}` } })).json();

test('an owner email counts only once it is verified', async () => {
  const impostor = await me('tok-unverified');
  assert.equal(impostor.isAdmin, false);
  assert.equal(impostor.phone, null, 'no phone until one is verified');
  const owner = await me('tok-verified');
  assert.equal(owner.staffRole, 'owner');
});
