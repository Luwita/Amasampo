import { useState } from 'react';
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { categories } from '../data/catalog';
import { getProvince } from '../data/zambia';
import { useStore } from '../context/StoreContext';
import LocationFields from './LocationFields';

function LocationButton() {
  const { location, setLocation } = useStore();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(location);

  return (
    <div className="loc-wrap">
      <button
        className="loc-btn"
        onClick={() => {
          setDraft(location);
          setOpen((o) => !o);
        }}
        aria-expanded={open}
      >
        <span className="loc-label">Deliver to</span>
        <strong>📍 {location.town}</strong>
      </button>
      {open && (
        <>
          <div className="backdrop" onClick={() => setOpen(false)} />
          <div className="card loc-pop">
            <h4>Where are you?</h4>
            <p className="muted small">We'll show shops near you first and delivery prices to your town.</p>
            <LocationFields value={draft} onChange={setDraft} idPrefix="hdr" />
            <button
              className="btn btn-primary btn-block"
              onClick={() => {
                setLocation(draft);
                setOpen(false);
              }}
            >
              Save location
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function Header() {
  const { cartCount, user, wishlist, location, myShop, unreadMessages, notificationCount, toDispatchCount, canInstall, install } = useStore();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  const onSearch = (e) => {
    e.preventDefault();
    navigate(query.trim() ? `/shop?q=${encodeURIComponent(query.trim())}` : '/shop');
  };

  const nearMe = `/shop?prov=${location.province}&town=${encodeURIComponent(location.town)}`;

  return (
    <header className="site-header">
      <div className="topbar">
        <div className="container topbar-inner">
          <span>🇿🇲 Local shops in all 10 provinces · Pay in Kwacha · Delivered by Zambian couriers</span>
          <span className="topbar-links">
            {user?.isAdmin ? (
              <Link to="/admin">🛡 Admin panel</Link>
            ) : myShop ? (
              <Link to="/seller">My shop dashboard</Link>
            ) : (
              <Link to="/sell">Open a shop</Link>
            )}
            <Link to="/delivery">Delivery & couriers</Link>
            {canInstall && (
              <button className="link-btn topbar-btn" onClick={install}>
                📲 Install app
              </button>
            )}
            <Link to="/help">Help & support</Link>
          </span>
        </div>
      </div>

      <div className="container header-main">
        <button className="icon-btn menu-btn" aria-label="Categories" onClick={() => setMenuOpen((o) => !o)}>
          ☰
        </button>
        <Link to="/" className="logo" aria-label="Zed Market home">
          <span className="logo-mark">Z</span>
          <span className="logo-text">
            zed<strong>market</strong>
          </span>
        </Link>

        <LocationButton />

        <form className="search" onSubmit={onSearch} role="search">
          <input
            type="search"
            placeholder="Search solar panels, phones, chitenge, roofing sheets…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search products"
          />
          <button type="submit">Search</button>
        </form>

        <nav className="header-actions">
          {!user?.isAdmin && (myShop || user?.accountType === 'seller') && (
            <Link to={myShop ? '/seller' : '/sell#register'} className="action">
              <span className="action-icon">🏪</span>
              <span className="action-label">{myShop ? 'My shop' : 'Set up shop'}</span>
              {toDispatchCount > 0 && <span className="badge-count" title="Parcels to send">{toDispatchCount}</span>}
            </Link>
          )}
          {user?.isAdmin && (
            <Link to="/admin" className="action">
              <span className="action-icon">🛡</span>
              <span className="action-label">Admin</span>
            </Link>
          )}
          {user && (
            <Link to="/messages" className="action">
              <span className="action-icon">💬</span>
              <span className="action-label">Messages</span>
              {unreadMessages > 0 && <span className="badge-count">{unreadMessages}</span>}
            </Link>
          )}
          {user && (
            <Link to="/notifications" className="action">
              <span className="action-icon">🔔</span>
              <span className="action-label">Alerts</span>
              {notificationCount > 0 && <span className="badge-count">{notificationCount}</span>}
            </Link>
          )}
          <Link to={user ? '/account' : '/login'} className="action">
            <span className="action-icon">👤</span>
            <span className="action-label">{user ? user.name.split(' ')[0] : 'Sign in'}</span>
          </Link>
          <Link to="/account?tab=wishlist" className="action action-saved">
            <span className="action-icon">♡</span>
            <span className="action-label">Saved</span>
            {wishlist.length > 0 && <span className="badge-count">{wishlist.length}</span>}
          </Link>
          <Link to="/cart" className="action">
            <span className="action-icon">🛒</span>
            <span className="action-label">Cart</span>
            {cartCount > 0 && <span className="badge-count">{cartCount}</span>}
          </Link>
        </nav>
      </div>

      <nav className={`catnav ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(false)}>
        <div className="container catnav-inner">
          <NavLink to="/shop" end>
            All products
          </NavLink>
          <Link to={nearMe}>📍 Near me ({location.town})</Link>
          <Link to={`/shop?prov=${location.province}`}>{getProvince(location.province)?.name} Province</Link>
          <NavLink to="/stores">Shops</NavLink>
          <NavLink to="/wholesale">Wholesale</NavLink>
          <NavLink to="/requests">Buying requests</NavLink>
          <Link to="/shop?sort=deals">Flash deals</Link>
          {categories.map((c) => (
            <Link key={c.id} to={`/shop?cat=${c.id}`}>
              {c.name}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
