import { applyDeliveryConfig } from '../src/data/delivery.js';

// Loads the delivery settings staff saved and applies them, so prices always use the latest rates
// (also when several API servers share one database).
export async function loadDelivery(q) {
  const rows = await q.query('SELECT key, value, updated_at FROM delivery_config');
  const saved = Object.fromEntries(rows.map((r) => [r.key, r]));
  const config = { couriers: saved.couriers?.value ?? null, points: saved.points?.value ?? null };
  applyDeliveryConfig(config);
  return {
    ...config,
    updatedAt: rows.reduce((latest, r) => (!latest || r.updated_at > latest ? r.updated_at : latest), null),
  };
}
