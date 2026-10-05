import { z } from 'zod';
import {
  COMMISSION_RATE,
  REFERRAL_REWARD,
  VOUCHER_DAYS,
  VOUCHER_MIN_SPEND,
  WELCOME_VOUCHER,
} from '../src/data/fees.js';

// Settings staff can change in the admin panel, with their defaults and allowed ranges.
export const SETTINGS = {
  commissionRate: { default: COMMISSION_RATE, schema: z.coerce.number().min(0).max(0.5) },
  welcomeVoucher: { default: WELCOME_VOUCHER, schema: z.coerce.number().min(0).max(5000) },
  referralReward: { default: REFERRAL_REWARD, schema: z.coerce.number().min(0).max(5000) },
  voucherMinSpend: { default: VOUCHER_MIN_SPEND, schema: z.coerce.number().min(0).max(100000) },
  voucherDays: { default: VOUCHER_DAYS, schema: z.coerce.number().int().min(1).max(365) },
};

export async function getSettings(q) {
  const rows = await q.query('SELECT key, value FROM settings');
  const saved = Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]));
  return Object.fromEntries(Object.entries(SETTINGS).map(([key, s]) => [key, saved[key] ?? s.default]));
}

export const settingsSchema = z.object(
  Object.fromEntries(Object.entries(SETTINGS).map(([key, s]) => [key, s.schema.optional()])),
);
