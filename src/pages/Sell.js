import { Link, useNavigate } from 'react-router-dom';
import ShopForm from '../components/ShopForm';
import { useStore } from '../context/StoreContext';

const steps = [
  {
    n: 1,
    title: 'Open your shop',
    text: 'Register your shop name, location and the couriers you use. It takes 2 minutes.',
  },
  {
    n: 2,
    title: 'Upload products',
    text: 'Add photos, prices, stock and wholesale prices from your phone or computer.',
  },
  { n: 3, title: 'Receive orders', text: 'Buyers near you and across Zambia order and pay with Mobile Money or cash.' },
  {
    n: 4,
    title: 'Deliver & get paid',
    text: 'Hand the parcel to Yango, Platinum, a bus or Zampost, or deliver it yourself.',
  },
];

const perks = [
  { icon: '🆓', title: 'Free to join', text: 'No listing fees. Pay a small commission only when you sell.' },
  {
    icon: '📍',
    title: 'Found by local buyers',
    text: 'Buyers in your town see your shop first, with the lowest delivery costs.',
  },
  {
    icon: '🛵',
    title: 'Use couriers you trust',
    text: 'Yango Delivery, Platinum Couriers, bus parcels, Zampost or your own rider.',
  },
  {
    icon: '📦',
    title: 'Sell retail & wholesale',
    text: 'Set bulk prices so shop owners in other provinces can stock up from you.',
  },
  { icon: '🤝', title: '1-on-1 support', text: 'An Amasampo agent helps you list products and get your first sales.' },
  { icon: '💸', title: 'Fast payouts', text: 'MTN, Airtel, Zamtel or bank, within 48 hours of delivery.' },
];

export default function Sell() {
  const { user, myShop, registerShop } = useStore();
  const navigate = useNavigate();

  return (
    <div className="sell">
      <section className="page-hero sell-hero">
        <div className="container">
          <span className="hero-kicker">Sell on Amasampo</span>
          <h1>Bring your shop online and sell across Zambia</h1>
          <p>
            Whether you trade at Kamwala, Chisokone, Mongu Harbour or from home, upload your products and reach buyers
            in all 10 provinces. Deliver with the Zambian couriers you already use.
          </p>
          {myShop ? (
            <Link to="/seller" className="btn btn-light btn-lg">
              Go to my shop dashboard
            </Link>
          ) : (
            <a href="#register" className="btn btn-light btn-lg">
              Open my shop. It's free
            </a>
          )}
        </div>
      </section>

      <section className="container section">
        <div className="perk-grid">
          {perks.map((p) => (
            <div key={p.title} className="card perk">
              <span className="perk-icon">{p.icon}</span>
              <h3>{p.title}</h3>
              <p className="muted">{p.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container section">
        <h2 className="center">How it works</h2>
        <div className="steps">
          {steps.map((s) => (
            <div key={s.n} className="step">
              <span className="step-n">{s.n}</span>
              <h3>{s.title}</h3>
              <p className="muted">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container section narrow" id="register">
        <div className="card form-card">
          {myShop ? (
            <div className="success">
              <div className="success-icon">✓</div>
              <h2>{myShop.name} is open</h2>
              <p>Add products and manage orders from your dashboard.</p>
              <Link to="/seller" className="btn btn-primary">
                Go to dashboard
              </Link>
            </div>
          ) : !user ? (
            <div className="empty">
              <h2>Open your shop</h2>
              <p className="muted">
                First sign in with your phone number. Your shop is linked to it, so you can manage it from any device.
              </p>
              <Link to={`/login?next=${encodeURIComponent('/sell#register')}`} className="btn btn-primary btn-lg">
                Continue with my phone number
              </Link>
            </div>
          ) : (
            <>
              <h2>Open your shop</h2>
              <ShopForm
                withOwner
                initial={{ ownerName: user.name === 'Amasampo Shopper' ? '' : user.name, phone: user.phone }}
                submitLabel="Open my shop"
                onSubmit={async (shop, owner) => {
                  await registerShop(shop, owner);
                  navigate('/seller?tab=add');
                }}
              />
              <p className="muted small center">Free to join. No listing fees.</p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
