import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanDatabaseUrl, createDb } from './db.js';

test('a pasted connection string is cleaned up', () => {
  const url = 'postgresql://user:pw@ep-x-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require';
  for (const pasted of [url, ` ${url} `, `"${url}"`, `'${url}'`, `DATABASE_URL=${url}`, `DATABASE_URL="${url}"\n`]) {
    assert.equal(cleanDatabaseUrl(pasted), url);
  }
  assert.equal(cleanDatabaseUrl(undefined), '');
});

test('a value that is not a connection string is refused instead of falling back to the built-in database', async () => {
  await assert.rejects(createDb({ url: 'neondb_owner:pw@host/neondb' }), /must start with postgresql:\/\//);
});
