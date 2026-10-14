import { Router } from 'express';
import { z } from 'zod';
import { EDITABLE_COURIER_FIELDS, couriers, getCourier } from '../../src/data/couriers.js';
import { pickupPoints } from '../../src/data/pickupPoints.js';
import { getProvince, provinces } from '../../src/data/zambia.js';
import { requireAdmin, requireOwner } from '../auth.js';
import { loadDelivery } from '../delivery.js';
import { HttpError, parse } from '../http.js';
import { logAdmin } from '../queries.js';

const BANDS = ['town', 'province', 'national'];
// A blank fee means the courier doesn't cover that distance.
// Checked as 'blank' before converting to a number, because converting null or '' would give 0 (free).
const blank = (v) => (v === '' || v === undefined ? null : v);
const fee = z.preprocess(blank, z.union([z.null(), z.coerce.number().min(0).max(100000)]));
const byBand = (schema) => z.object(Object.fromEntries(BANDS.map((b) => [b, schema.optional()])));

// Distance pricing (Yango): a fare per vehicle, the heaviest parcel a motorbike takes, and the trip assumed
// when a map position is missing.
const fare = z.object({
  minFare: z.coerce.number().min(0).max(10000),
  includedKm: z.coerce.number().min(0).max(100),
  perKm: z.coerce.number().min(0).max(1000),
  perMin: z.preprocess(blank, z.union([z.null(), z.coerce.number().min(0).max(100)])).optional(),
});
const distanceSchema = z.object({
  moto: fare,
  car: fare,
  motoMaxKg: z.coerce.number().positive().max(1000),
  typicalKm: z.coerce.number().positive().max(200),
});

const courierSchema = z.object({
  description: z.string().trim().min(3).max(200),
  rates: byBand(fee),
  perKg: byBand(fee),
  maxKg: z.preprocess(blank, z.union([z.null(), z.coerce.number().positive().max(10000)])),
  eta: byBand(z.string().trim().max(40)),
  towns: z.array(z.string()).max(120).optional(),
  cod: z.boolean(),
  disabled: z.boolean().default(false),
  distance: distanceSchema.optional(),
});

const pointSchema = z
  .object({
    id: z.string().trim().regex(/^[a-z0-9-]{2,40}$/, 'Point codes use lowercase letters, numbers and dashes'),
    province: z.string().refine((p) => getProvince(p), 'Choose a province'),
    town: z.string().min(1),
    name: z.string().trim().min(3, 'Give the point a name').max(80),
    address: z.string().trim().min(3, 'Give the address or landmark').max(160),
    hours: z.string().trim().max(80).default(''),
    phone: z.string().trim().max(20).default(''),
    active: z.boolean().default(true),
  })
  .refine((p) => getProvince(p.province)?.towns.includes(p.town), 'That town is not in the selected province');

// What the app needs to show prices: the editable courier fields and the active points.
function publicView(config) {
  return {
    couriers: Object.fromEntries(
      couriers.map((c) => [
        c.id,
        { ...Object.fromEntries(EDITABLE_COURIER_FIELDS.map((k) => [k, c[k]])), confirmed: c.confirmed },
      ]),
    ),
    points: pickupPoints,
    pointsConfirmed: !!config.points,
    updatedAt: config.updatedAt,
  };
}

export function deliveryRoutes(db) {
  const router = Router();
  // Public: the browser applies these before showing any delivery price.
  router.get('/delivery', async (_req, res) => {
    res.json(publicView(await loadDelivery(db)));
  });
  return router;
}

export function deliveryAdminRoutes(db) {
  const router = Router();
  router.use(requireAdmin);

  router.get('/delivery', async (_req, res) => {
    res.json(publicView(await loadDelivery(db)));
  });

  // Save one courier's rates and times (owners only: prices are a business decision).
  router.put('/delivery/couriers/:id', requireOwner, async (req, res) => {
    const courier = getCourier(req.params.id);
    if (!courier) throw new HttpError(404, 'Unknown courier');
    const body = parse(courierSchema, req.body);
    if (courier.distance && !body.distance) throw new HttpError(400, `Give ${courier.name}'s fares per km`);
    if (!courier.distance) delete body.distance;
    if (body.towns) {
      const known = new Set(provinces.flatMap((p) => p.towns));
      const unknown = body.towns.find((t) => !known.has(t));
      if (unknown) throw new HttpError(400, `${unknown} is not a town Zed Market knows`);
    }
    await db.tx(async (t) => {
      const [row] = await t.query(`SELECT value FROM delivery_config WHERE key = 'couriers' FOR UPDATE`);
      const saved = { ...(row?.value ?? {}), [courier.id]: body };
      await t.query(
        `INSERT INTO delivery_config (key, value, updated_by) VALUES ('couriers', $1, $2)
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_by = $2, updated_at = now()`,
        [JSON.stringify(saved), req.user.id],
      );
      const d = body.distance;
      const rates = d
        ? `moto K${d.moto.minFare} + K${d.moto.perKm}/km, car K${d.car.minFare} + K${d.car.perKm}/km`
        : BANDS.filter((b) => body.rates[b] != null)
            .map((b) => `${b} K${body.rates[b]}`)
            .join(', ');
      await logAdmin(t, req.user.id, 'courier rates saved', 'courier', courier.id, `${courier.name}: ${rates || 'no rates'}${body.disabled ? ' (switched off)' : ''}`);
    });
    res.json(publicView(await loadDelivery(db)));
  });

  // Replace the list of Zed Market Points.
  router.put('/delivery/points', requireOwner, async (req, res) => {
    const points = parse(z.array(pointSchema).max(500), req.body?.points);
    const ids = new Set();
    for (const p of points) {
      if (ids.has(p.id)) throw new HttpError(400, `Two points use the code ${p.id}`);
      ids.add(p.id);
    }
    await db.tx(async (t) => {
      await t.query(
        `INSERT INTO delivery_config (key, value, updated_by) VALUES ('points', $1, $2)
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_by = $2, updated_at = now()`,
        [JSON.stringify(points), req.user.id],
      );
      await logAdmin(t, req.user.id, 'Zed Market Points saved', 'points', 'all', `${points.filter((p) => p.active).length} active of ${points.length}`);
    });
    res.json(publicView(await loadDelivery(db)));
  });

  return router;
}
