import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { normalizePhone } from '../src/utils/format.js';
import { HttpError, newId, parse } from './http.js';
import { toUser } from './mappers.js';
import { getSettings } from './settings.js';
import { consoleSms } from './sms.js';
import { notify } from './notify.js';

// A short, shareable invite code such as CHANDA42K.
async function uniqueReferralCode(db, name) {
  const base = (name || 'ZED').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6) || 'ZED';
  for (let i = 0; i < 20; i++) {
    const code = base + randomBytes(2).toString('hex').toUpperCase().slice(0, 3);
    const [taken] = await db.query('SELECT 1 FROM users WHERE referral_code = $1', [code]);
    if (!taken) return code;
  }
  return 'ZM' + randomBytes(4).toString('hex').toUpperCase();
}

const CODE_TTL_MIN = 10;
const RESEND_AFTER_SEC = 30;
const MAX_ATTEMPTS = 5;
const SESSION_DAYS = 30;

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

const phoneSchema = z
  .string()
  .transform(normalizePhone)
  .refine((p) => /^[79]\d{8}$/.test(p), 'Enter a valid Zambian mobile number, e.g. 097 123 4567');


// Suspended accounts load as nobody, so their sessions stop working everywhere at once.
// Owners are the ADMIN_PHONES numbers (checked on every request, so removing a number revokes access at once);
// other staff are added in the admin panel. Staff accounts run the marketplace and never act as a shop.
async function loadUser(db, userId, admins) {
  const [row] = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
  if (!row || row.suspended_at) return null;
  const isOwner = admins.has(row.phone);
  const isAdmin = isOwner || row.is_staff;
  const [shop] = isAdmin ? [] : await db.query('SELECT id FROM shops WHERE owner_id = $1', [userId]);
  return { ...toUser(row, shop?.id ?? null), isAdmin, staffRole: isOwner ? 'owner' : isAdmin ? 'staff' : null };
}

// Adds req.user when a valid bearer token is sent.
const adminSet = (phones = []) => new Set(phones.map(normalizePhone).filter(Boolean));

export const authenticate = (db, { adminPhones = [] } = {}) => {
  const admins = adminSet(adminPhones);
  return async (req, _res, next) => {
    const token = req.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
    if (token) {
      const [session] = await db.query('SELECT user_id FROM sessions WHERE token_hash = $1 AND expires_at > now()', [
        sha256(token),
      ]);
      if (session) req.user = await loadUser(db, session.user_id, admins);
    }
    next();
  };
};

export const requireUser = (req, _res, next) => {
  if (!req.user) throw new HttpError(401, 'Please sign in first');
  next();
};

export const requireAdmin = (req, _res, next) => {
  if (!req.user) throw new HttpError(401, 'Please sign in first');
  if (!req.user.isAdmin) throw new HttpError(403, 'Staff only');
  next();
};

// Owners (ADMIN_PHONES) manage the staff list and platform settings.
export const requireOwner = (req, _res, next) => {
  if (!req.user) throw new HttpError(401, 'Please sign in first');
  if (req.user.staffRole !== 'owner') throw new HttpError(403, 'Only Zed Market owners can do this');
  next();
};

// `adminPhones`: numbers (any format) that become Zed Market staff accounts when they sign in.
export function authRoutes(db, { sms = consoleSms, exposeCodes = false, adminPhones = [] } = {}) {
  const admins = adminSet(adminPhones);
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
    try {
      await sms.send(phone, `Your Zed Market code is ${code}. It expires in ${CODE_TTL_MIN} minutes.`);
    } catch (err) {
      // In development the code is shown on screen anyway, so a broken SMS setup doesn't block signing in.
      if (exposeCodes) {
        console.error(`[sms] not sent (development: the code is shown on the sign-in screen): ${err.message}`);
        return res.json({ sent: false, devCode: code });
      }
      // Nothing was sent, so don't make the person wait before trying again.
      await db.query('DELETE FROM otp_codes WHERE phone = $1', [phone]);
      throw err;
    }
    res.json({ sent: true, ...(exposeCodes ? { devCode: code } : {}) });
  });

  router.post('/verify', async (req, res) => {
    const body = parse(
      z.object({
        phone: phoneSchema,
        code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code we sent you'),
        name: z.string().trim().max(80).optional(),
        accountType: z.enum(['buyer', 'business', 'seller']).optional(),
        referralCode: z.string().trim().max(20).optional(),
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
      // Signing up with a friend's invite code earns a welcome voucher (the friend is rewarded later, on delivery).
      const [inviter] = body.referralCode
        ? await db.query('SELECT id FROM users WHERE referral_code = upper($1) AND deleted_at IS NULL', [body.referralCode])
        : [];
      const name = body.name || 'Zed Market Shopper';
      [user] = await db.query(
        `INSERT INTO users (id, phone, name, account_type, referral_code, referred_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [newId('usr'), body.phone, name, body.accountType ?? 'buyer', await uniqueReferralCode(db, name), inviter?.id ?? null]
      );
      if (inviter) {
        const { welcomeVoucher, voucherMinSpend, voucherDays } = await getSettings(db);
        await db.query(
          `INSERT INTO vouchers (id, user_id, amount, min_spend, reason, related_user_id, expires_at)
           VALUES ($1, $2, $3, $4, 'welcome', $5, now() + make_interval(days => $6))`,
          [newId('vch'), user.id, welcomeVoucher, voucherMinSpend, inviter.id, voucherDays]
        );
        await notify(db, user.id, {
          kind: 'voucher',
          title: `Welcome! K${welcomeVoucher} off your first order`,
          body: `Your friend's invite gave you a K${welcomeVoucher} voucher for orders of K${voucherMinSpend} or more.`,
          link: '/account?tab=invite',
        });
      }
    }
    if (user.suspended_at) {
      throw new HttpError(
        403,
        'This account is suspended. Contact support@zedmarket.co.zm if you think this is a mistake.',
      );
    }

    const token = randomBytes(32).toString('base64url');
    await db.query(
      `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`,
      [sha256(token), user.id, SESSION_DAYS],
    );
    res.json({ token, user: await loadUser(db, user.id, admins), isNew });
  });

  router.post('/logout', async (req, res) => {
    const token = req.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
    if (token) await db.query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
    res.json({ ok: true });
  });

  router.get('/me', requireUser, (req, res) => res.json(req.user));

  return router;
}
