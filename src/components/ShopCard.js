import { Link } from 'react-router-dom';
import { getCourier } from '../data/couriers';
import { formatLocation } from '../data/zambia';

export function CourierChips({ ids }) {
  return (
    <div className="chips">
      {ids.map((id) => {
        const c = getCourier(id);
        return c ? (
          <span key={id} className="chip" title={c.description}>
            {c.icon} {c.name}
          </span>
        ) : null;
      })}
    </div>
  );
}

export default function ShopCard({ shop }) {
  return (
    <Link to={`/store/${shop.id}`} className="card shop-card">
      <span className="shop-logo">{shop.logo ?? '🏪'}</span>
      <div className="shop-card-body">
        <h3>{shop.name}</h3>
        <div className="muted small">
          📍 {shop.area ? `${shop.area}, ` : ''}
          {formatLocation(shop)}
        </div>
        <div className="small">
          {shop.rating ? `★ ${shop.rating}` : '✨ New shop'} · {shop.productCount ?? 0} products
        </div>
      </div>
    </Link>
  );
}
