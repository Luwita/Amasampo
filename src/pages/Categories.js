import { Link } from 'react-router-dom';
import { categories } from '../data/catalog';
import { getProvince } from '../data/zambia';
import { useStore } from '../context/StoreContext';

// The "Categories" tab of the phone layout: everything the website keeps in its menu bar and footer.
export default function Categories() {
  const { location, user, myShop, wishlist, toDispatchCount, lowData, setLowData } = useStore();
  const province = getProvince(location.province)?.name;

  const browse = [
    { to: `/shop?prov=${location.province}&town=${encodeURIComponent(location.town)}`, icon: '📍', label: `Near me (${location.town})` },
    { to: `/shop?prov=${location.province}`, icon: '🗺️', label: `${province} Province` },
    { to: '/shop?sort=deals', icon: '⚡', label: 'Flash deals' },
    { to: '/wholesale', icon: '📦', label: 'Wholesale' },
    { to: '/stores', icon: '🏪', label: 'Shops' },
    { to: '/requests', icon: '📝', label: 'Buying requests' },
  ];

  const selling = user?.isAdmin
    ? { to: '/admin', icon: '🛡', label: 'Admin panel' }
    : myShop
      ? { to: '/seller', icon: '🏪', label: 'My shop dashboard', count: toDispatchCount }
      : { to: '/sell', icon: '🏪', label: 'Open a shop' };

  const more = [
    selling,
    { to: '/account?tab=wishlist', icon: '♡', label: 'Saved items', count: wishlist.length },
    { to: user ? '/notifications' : '/login?next=/notifications', icon: '🔔', label: 'Alerts' },
    { to: '/delivery', icon: '🚚', label: 'Delivery & couriers' },
    { to: '/help', icon: '💁', label: 'Help & support' },
    { to: '/legal/returns', icon: '↩️', label: 'Returns & refunds' },
    { to: '/legal/terms', icon: '📄', label: 'Terms' },
    { to: '/legal/privacy', icon: '🔒', label: 'Privacy' },
  ];

  return (
    <div className="container categories-page">
      <section className="section">
        <h2>Categories</h2>
        <div className="cat-tiles">
          <Link to="/shop" className="cat-tile">
            <span className="cat-tile-icon">🛍️</span>
            <span>All products</span>
          </Link>
          {categories.map((c) => (
            <Link key={c.id} to={`/shop?cat=${c.id}`} className="cat-tile">
              <span className="cat-tile-icon" style={{ '--tint': c.color }}>
                {c.icon}
              </span>
              <span>{c.name}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>Browse</h2>
        <div className="card menu-list">
          {browse.map((l) => (
            <MenuLink key={l.label} {...l} />
          ))}
        </div>
      </section>

      <section className="section">
        <h2>More</h2>
        <div className="card menu-list">
          {more.map((l) => (
            <MenuLink key={l.label} {...l} />
          ))}
          <label className="menu-row check">
            <input type="checkbox" checked={lowData} onChange={(e) => setLowData(e.target.checked)} />
            <span className="grow">📶 Low-data mode: skip photos and load fewer products</span>
          </label>
        </div>
      </section>
    </div>
  );
}

function MenuLink({ to, icon, label, count }) {
  return (
    <Link to={to} className="menu-row">
      <span className="menu-icon">{icon}</span>
      <span className="grow">{label}</span>
      {count > 0 && <span className="menu-count">{count}</span>}
      <span className="muted">›</span>
    </Link>
  );
}
