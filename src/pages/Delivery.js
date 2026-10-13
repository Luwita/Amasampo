import { useState } from 'react';
import { Link } from 'react-router-dom';
import LocationFields from '../components/LocationFields';
import { useStore } from '../context/StoreContext';
import { INCLUDED_KG, activeCouriers, formatKg, quote } from '../data/couriers';
import { formatLocation, provinces } from '../data/zambia';
import { formatK } from '../utils/format';

// Lowest extra-kg rate a courier charges, ignoring distances it doesn't cover.
const perKgFrom = (c) => {
  const values = Object.values(c.perKg ?? {}).filter((v) => typeof v === 'number' || (typeof v === 'string' && v !== ''));
  return values.length ? Math.min(...values.map(Number)) : null;
};

const BAND_LABEL = { town: 'Same town', province: 'Same province', national: 'Province to province' };

export default function Delivery() {
  const { location, shops } = useStore();
  const [from, setFrom] = useState({ province: 'copperbelt', town: 'Kitwe' });
  const [to, setTo] = useState(location);
  const [weight, setWeight] = useState(2);

  const couriers = activeCouriers();
  const fakeShop = { ...from, couriers: couriers.map((c) => c.id) };
  const quotes = couriers
    .filter((c) => c.id !== 'pickup')
    .map((c) => ({ courier: c, q: quote(c.id, fakeShop, to, weight || 1) }));

  return (
    <div>
      <section className="page-hero logistics-hero">
        <div className="container">
          <span className="hero-kicker">Delivery on Zed Market</span>
          <h1>Delivered across Zambia by Zambian couriers</h1>
          <p>
            Every shop chooses the couriers it works with. At checkout you see each option with its price and delivery
            time to your town, from same-day Yango Delivery to bus parcels to Mansa or Mongu.
          </p>
          <a href="#estimate" className="btn btn-light btn-lg">
            Check a delivery price
          </a>
        </div>
      </section>

      <section className="container section">
        <div className="perk-grid">
          {couriers.map((c) => (
            <div key={c.id} className="card perk">
              <span className="perk-icon">{c.icon}</span>
              <h3>{c.name}</h3>
              <p className="muted">{c.description}</p>
              <ul className="rate-list small">
                {Object.entries(c.rates)
                  .filter(([, fee]) => fee !== null && fee !== undefined && fee !== '')
                  .map(([b, fee]) => (
                  <li key={b}>
                    <span>{BAND_LABEL[b]}</span>
                    <strong>{fee ? `from ${formatK(fee)}` : 'Free'}</strong>
                  </li>
                ))}
              </ul>
              {perKgFrom(c) !== null && (
                <p className="muted small">
                  Includes {INCLUDED_KG} kg, then from {formatK(perKgFrom(c))}/kg
                  {c.maxKg ? ` · max ${c.maxKg} kg` : ''}
                </p>
              )}
              {c.towns && <p className="muted small">Available in {c.towns.join(', ')}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="container section narrow" id="estimate">
        <div className="card form-card">
          <h2>Delivery price checker</h2>
          <div className="form-grid">
            <div>
              <h4>From (shop)</h4>
              <LocationFields value={from} onChange={setFrom} idPrefix="from" />
            </div>
            <div>
              <h4>To (you)</h4>
              <LocationFields value={to} onChange={setTo} idPrefix="to" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="weight">Parcel weight (kg)</label>
            <input
              id="weight"
              type="number"
              min="0.1"
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(Math.max(0, Number(e.target.value)))}
            />
          </div>
          <ul className="delivery-list">
            {quotes.map(({ courier, q }) => (
              <li key={courier.id} className={q ? '' : 'unavailable'}>
                <span className="d-icon">{courier.icon}</span>
                <span className="d-name">
                  {courier.name}
                  <span className="muted small block">
                    {q
                      ? q.eta
                      : courier.maxKg && weight > courier.maxKg
                        ? `Max ${courier.maxKg} kg`
                        : 'Not available for this route'}
                  </span>
                </span>
                <strong>{q ? formatK(q.fee) : '—'}</strong>
              </li>
            ))}
          </ul>
          <p className="muted small">
            {formatLocation(from)} → {formatLocation(to)}, {formatKg(weight || 1)}. Prices are estimates.
          </p>
        </div>
      </section>

      <section className="container section">
        <h2 className="center">Shops in every province</h2>
        <div className="province-grid">
          {provinces.map((p) => (
            <Link key={p.id} to={`/stores?prov=${p.id}`} className="province-tile">
              <strong>{p.name}</strong>
              <span className="muted small">{shops.filter((s) => s.province === p.id).length} shops</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
