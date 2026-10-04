import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as api from '../api';
import { BuyerPriceRequests } from '../components/PriceRequests';
import ProductCard from '../components/ProductCard';
import ShipmentStatus from '../components/ShipmentStatus';
import Stars from '../components/Stars';
import { useStore } from '../context/StoreContext';
import { formatLocation } from '../data/zambia';
import { formatK } from '../utils/format';

const roleLabel = { business: 'Business buyer', seller: 'Shop owner', buyer: 'Shopper' };

// The buyer's rights under the Data Protection Act: a copy of their data, and deleting the account.
function PrivacyPanel() {
  const { deleteAccount, myShop, notify } = useStore();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const download = async () => {
    try {
      const data = await api.exportMyData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'amasampo-my-data.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      notify(err.message);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      navigate('/');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="card form-card narrow-card">
      <h2>Your data</h2>
      <p className="muted">
        Download a copy of everything Amasampo holds about you: profile, orders, reviews, messages and price requests.
        See our <Link to="/legal/privacy">privacy policy</Link>.
      </p>
      <button className="btn btn-outline" onClick={download}>
        ⬇ Download my data
      </button>

      <h2 className="danger-title">Delete my account</h2>
      {myShop ? (
        <p className="muted">
          You own {myShop.name}. Contact support@amasampo.co.zm to close your shop before deleting your account.
        </p>
      ) : (
        <>
          <p className="muted">
            Your name, phone number, messages and price requests are removed and you are signed out. Shops keep order
            records without your details. This can't be undone.
          </p>
          <div className="field">
            <label htmlFor="confirm-delete">Type DELETE to confirm</label>
            <input id="confirm-delete" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {error && <p className="error">{error}</p>}
          <button className="btn btn-danger" disabled={confirm !== 'DELETE' || busy} onClick={remove}>
            {busy ? 'Deleting…' : 'Delete my account'}
          </button>
        </>
      )}
    </div>
  );
}

// One bought item. Once its parcel is delivered, the buyer can rate it (once).
function OrderItem({ orderId, item, delivered }) {
  const { reviewItem } = useStore();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!rating) return setError('Choose 1 to 5 stars');
    setSaving(true);
    try {
      await reviewItem({ orderId, productId: item.id, rating, comment });
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="order-item">
      <span>
        {item.qty} × <Link to={`/product/${item.id}`}>{item.name}</Link>
        {item.options && <span className="muted"> ({item.options})</span>}
      </span>
      {item.reviewRating ? (
        <span className="small muted">
          You rated <Stars value={item.reviewRating} size="sm" />
        </span>
      ) : (
        delivered &&
        !open && (
          <button className="btn btn-outline btn-sm" onClick={() => setOpen(true)}>
            ★ Rate this item
          </button>
        )
      )}
      {open && (
        <form className="review-form" onSubmit={submit}>
          <Stars value={rating} onChange={setRating} />
          <textarea
            rows="2"
            placeholder="What did you like or not like? (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            aria-label="Your review"
          />
          {error && <span className="error">{error}</span>}
          <div className="pdp-buttons">
            <button className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? 'Sending…' : 'Post review'}
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </li>
  );
}

export default function Account() {
  const { user, logout, orders, wishlist, getProduct, myShop, location } = useStore();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const tab = params.get('tab') ?? 'orders';
  const saved = wishlist.map(getProduct).filter(Boolean);
  const myOrders = user ? orders : [];
  const needsShop = user?.accountType === 'seller' && !myShop;

  return (
    <div className="container section">
      <div className="account-head">
        <div>
          <h1>{user ? `Muli shani, ${user.name.split(' ')[0]}` : 'My account'}</h1>
          <p className="muted">
            {user && `${user.phone} · ${roleLabel[user.accountType] ?? 'Shopper'} · `}📍 {formatLocation(location)}
          </p>
        </div>
        <div className="pdp-buttons">
          {myShop && (
            <Link to="/seller" className="btn btn-primary">
              🏪 {myShop.name} dashboard
            </Link>
          )}
          {user ? (
            <button
              className="btn btn-outline"
              onClick={() => {
                logout();
                navigate('/');
              }}
            >
              Sign out
            </button>
          ) : (
            <Link to="/login" className="btn btn-primary">
              Sign in
            </Link>
          )}
        </div>
      </div>

      {needsShop && (
        <div className="card setup-shop">
          <span className="shop-logo">🏪</span>
          <div className="grow">
            <strong>Finish setting up your shop</strong>
            <p className="muted small">
              Add your shop name, location and couriers, then start uploading products. It takes 2 minutes.
            </p>
          </div>
          <Link to="/sell#register" className="btn btn-primary">
            Set up my shop
          </Link>
        </div>
      )}

      <div className="tabs">
        <button className={tab === 'orders' ? 'on' : ''} onClick={() => setParams({ tab: 'orders' })}>
          Orders ({myOrders.length})
        </button>
        <button className={tab === 'wishlist' ? 'on' : ''} onClick={() => setParams({ tab: 'wishlist' })}>
          Saved items ({saved.length})
        </button>
        {user && (
          <>
            <button className={tab === 'quotes' ? 'on' : ''} onClick={() => setParams({ tab: 'quotes' })}>
              Price requests
            </button>
            <button className={tab === 'privacy' ? 'on' : ''} onClick={() => setParams({ tab: 'privacy' })}>
              Privacy & data
            </button>
          </>
        )}
      </div>

      {tab === 'orders' &&
        (myOrders.length ? (
          <div className="orders">
            {myOrders.map((o) => (
              <div key={o.id} className="card order">
                <div className="order-head">
                  <strong>{o.id}</strong>
                  <span className="muted small">
                    {new Date(o.date).toLocaleDateString('en-ZM', { dateStyle: 'medium' })} · {o.payment}
                  </span>
                  <span>
                    <strong>{formatK(o.total)}</strong>{' '}
                    <Link to={`/order/${o.id}/receipt`} className="link small">
                      Receipt
                    </Link>
                  </span>
                </div>
                {o.shipments.map((s) => (
                  <div key={s.shopId} className="order-shipment">
                    <strong className="small">{s.shopName}</strong>
                    <ul className="order-items">
                      {s.items.map((i) => (
                        <OrderItem
                          key={`${i.id}-${i.options}`}
                          orderId={o.id}
                          item={i}
                          delivered={s.status === 'delivered'}
                        />
                      ))}
                    </ul>
                    <ShipmentStatus shipment={s} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="card empty">
            <p>{user ? 'No orders yet.' : 'Sign in to see your orders.'}</p>
            <Link to={user ? '/shop' : '/login?next=/account'} className="btn btn-primary">
              {user ? 'Start shopping' : 'Sign in'}
            </Link>
          </div>
        ))}

      {tab === 'quotes' && user && <BuyerPriceRequests />}
      {tab === 'privacy' && user && <PrivacyPanel />}

      {tab === 'wishlist' &&
        (saved.length ? (
          <div className="grid grid-4">
            {saved.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : (
          <div className="card empty">
            <p>Tap ♡ on any product to save it here.</p>
          </div>
        ))}
    </div>
  );
}
