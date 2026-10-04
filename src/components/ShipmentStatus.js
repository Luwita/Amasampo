import { getCourier } from '../data/couriers';

const STEPS = [
  { id: 'pending', label: 'Order placed' },
  { id: 'dispatched', label: 'With courier' },
  { id: 'delivered', label: 'Delivered' },
];

export const statusLabel = (shipment) => {
  const pickup = shipment.courier === 'pickup';
  if (shipment.status === 'delivered') return pickup ? 'Collected' : 'Delivered';
  if (shipment.status === 'dispatched') return pickup ? 'Ready for collection' : `Sent with ${shipment.courierName}`;
  return pickup ? 'Being prepared' : 'Awaiting dispatch';
};

export default function ShipmentStatus({ shipment }) {
  const current = STEPS.findIndex((s) => s.id === shipment.status);
  const courier = getCourier(shipment.courier);
  return (
    <div className="shipment-status">
      <div className="track">
        {STEPS.map((step, i) => (
          <div key={step.id} className={`track-step ${i <= current ? 'done' : ''}`}>
            <span className="track-dot" />
            {step.id === 'dispatched' && shipment.courier === 'pickup' ? 'Ready to collect' : step.label}
          </div>
        ))}
      </div>
      <div className="small muted">
        {courier?.icon} {shipment.courierName} · {shipment.eta}
        {shipment.tracking && (
          <>
            {' '}
            · Tracking / waybill: <strong>{shipment.tracking}</strong>
          </>
        )}
      </div>
    </div>
  );
}
