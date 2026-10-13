import { applyCourierConfig } from './couriers.js';
import { applyPointConfig } from './pickupPoints.js';

// Applies the delivery settings saved by staff (courier rates and Zed Market Points), used by the
// server before pricing an order and by the browser when the app loads.
// `config` is { couriers: { [id]: fields } | null, points: [...] | null }.
export function applyDeliveryConfig(config = {}) {
  applyCourierConfig(config.couriers ?? {});
  applyPointConfig(config.points ?? null);
}
