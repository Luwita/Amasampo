import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { normalizePhone } from '../src/utils/format.js';
import { HttpError, newId, parse } from './http.js';
import { toUser } from './mappers.js';

const CODE_TTL_MIN = 10;
const RESEND_AFTER_SEC = 30;
const MAX_ATTEMPTS = 5;
const SESSION_DAYS = 30;

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

const phoneSchema = z
  .string()
  .transform(normalizePhone)
  .refine((p) => /^[79]\d{8}$/.test(p), 'Enter a valid Zambian mobile number, e.g. 097 123 4567');

// Delivers sign-in codes. Until an SMS provider is connected, codes are printed to the server console.
export const consoleSms = {
  async send(phone, message) {
    console.log(`[sms] to 0${phone}: ${message}`);
  },
};

async function loadUser(db, userId) {
  const [row] = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
  if (!row) return null;
  const [shop] = await db.query('SELECT id FROM shops WHERE owner_id = $1', [userId]);
  return toUser(row, shop?.id ?? null);
}

// Adds req.user when a valid bearer token is sent.
export const authenticate = (db) => async (req, _res, next) => {
  const token = req.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (token) {
    const [session] = await db.query('SELECT user_id FROM sessions WHERE token_hash = $1 AND expires_at > now()', [
      sha256(token),
    ]);
    if (session) req.user = await loadUser(db, session.user_id);
  }
  next();
};

export const requireUser = (req, _res, next) => {
  if (!req.user) throw new HttpError(401, 'Please sign in first');
  next();
};

export function authRoutes(db, { sms = consoleSms, exposeCodes = false } = {}) {
  const router = Router();

  router.post('/request-code', async (req, res) => {
    const { phone } = parse(z.object({ phone: phoneSchema }), req.body);
    const [existing] = await db.query(
      `SELECT 1 FROM otp_codes WHERE phone = $1 AND sent_at > now() - make_interval(secs => $2)`,
      [phone, RESEND_AFTER_SEC],
    );
    if (existing) throw new HttpError(429, `Please wait ${RESEND_AFTER_SEC} seconds before asking for another code`);

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await db.query(
      `INSERT INTO otp_codes (phone, code_hash, expires_at, attempts, sent_at)
       VALUES ($1, $2, now() + make_interval(mins => $3), 0, now())
       ON CONFLICT (phone) DO UPDATE SET code_hash = $2, expires_at = EXCLUDED.expires_at, attempts = 0, sent_at = now()`,
      [phone, sha256(`${phone}:${code}`), CODE_TTL_MIN],
    );
    await sms.send(phone, `Your Amasampo code is ${code}. It expires in ${CODE_TTL_MIN} minutes.`);
    res.json({ sent: true, ...(exposeCodes ? { devCode: code } : {}) });
  });

  router.post('/verify', async (req, res) => {
    const body = parse(
      z.object({
        phone: phoneSchema,
        code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code we sent you'),
        name: z.string().trim().max(80).optional(),
        accountType: z.enum(['buyer', 'business', 'seller']).optional(),
      }),
      req.body,
    );

    const [otp] = await db.query('SELECT * FROM otp_codes WHERE phone = $1', [body.phone]);
    if (!otp || new Date(otp.expires_at) < new Date())
      throw new HttpError(400, 'That code has expired. Ask for a new one.');
    if (otp.attempts >= MAX_ATTEMPTS) throw new HttpError(429, 'Too many wrong codes. Ask for a new one.');

    const expected = Buffer.from(otp.code_hash, 'hex');
    const given = Buffer.from(sha256(`${body.phone}:${body.code}`), 'hex');
    if (!timingSafeEqual(expected, given)) {
      await db.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE phone = $1', [body.phone]);
      throw new HttpError(400, 'That code is not correct');
    }
    await db.query('DELETE FROM otp_codes WHERE phone = $1', [body.phone]);

    let [user] = await db.query('SELECT * FROM users WHERE phone = $1', [body.phone]);
    const isNew = !user;
    if (isNew) {
      [user] = await db.query('INSERT INTO users (id, phone, name, account_type) VALUES ($1, $2, $3, $4) RETURNING *', [
        newId('usr'),
        body.phone,
        body.name || 'Amasampo Shopper',
        body.accountType ?? 'buyer',
      ]);
    }

    const token = randomBytes(32).toString('base64url');
    await db.query(
      `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`,
      [sha256(token), user.id, SESSION_DAYS],
    );
    res.json({ token, user: await loadUser(db, user.id), isNew });
  });

  router.post('/logout', async (req, res) => {
    const token = req.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
    if (token) await db.query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
    res.json({ ok: true });
  });

  router.get('/me', requireUser, (req, res) => res.json(req.user));

  return router;
}
