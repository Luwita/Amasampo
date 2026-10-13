import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import ProductGrid from '../components/ProductGrid';
import { useStore } from '../context/StoreContext';
import { categories } from '../data/catalog';
import { useProductSearch } from '../hooks/useProducts';
import { Hero } from './Home';

// The list last chosen, so coming back from a product shows the same one.
const last = { wholesale: false, view: 'for-you' };

// Home screen of the phone layout: banner, quick links, a category grid, then one endless product feed with
// a Retail/Wholesale switch and a few ways to order it.
export default function HomeApp() {
  const { location, lowData, user } = useStore();
  const [wholesale, setWholesaleState] = useState(last.wholesale);
  const [view, setViewState] = useState(last.view);
  const setWholesale = (value) => setWholesaleState((last.wholesale = value));
  const setView = (value) => setViewState((last.view = value));

  const views = [
    { id: 'for-you', label: 'For you', params: { sort: 'popular' } },
    { id: 'near', label: `Near ${location.town}`, params: { prov: location.province, sort: 'nearest' } },
    { id: 'deals', label: 'Deals', params: { sort: 'deals' } },
    { id: 'new', label: 'New', params: { sort: 'newest' } },
    { id: 'local', label: 'Made in Zambia', params: { local: '1', sort: 'popular' } },
  ];
  const current = views.find((v) => v.id === view) ?? views[0];
  const feed = useProductSearch({
    nearProv: location.province,
    nearTown: location.town,
    ...current.params,
    wholesale: wholesale ? '1' : '',
    limit: lowData ? 8 : 12,
  });

  const quickLinks = [
    { to: '/stores', icon: 'pin', label: 'Shops near me' },
    { to: user ? '/account' : '/login', icon: 'box', label: 'My orders' },
    { to: '/delivery', icon: 'truck', label: 'Delivery' },
    { to: '/requests', icon: 'chat', label: 'Buying requests' },
    { to: '/help', icon: 'help', label: 'Help' },
  ];
  const topCategories = categories.slice(0, 7);

  return (
    <div className="home app-home">
      <section className="container">
        <Hero />
      </section>

      <nav className="quick-links scroll-row" aria-label="Quick links">
        {quickLinks.map((l) => (
          <Link key={l.label} to={l.to}>
            <Icon name={l.icon} size={18} />
            {l.label}
          </Link>
        ))}
      </nav>

      <section className="container">
        <h2 className="app-title">Shop by category</h2>
        <div className="cat-wall">
          {topCategories.map((c) => (
            <Link key={c.id} to={`/shop?cat=${c.id}`}>
              <span className="cat-wall-icon">{c.icon}</span>
              {c.name}
            </Link>
          ))}
          <Link to="/categories">
            <span className="cat-wall-icon more">
              <Icon name="grid" size={22} />
            </span>
            All categories
          </Link>
        </div>
      </section>

      <section className="container feed">
        <div className="feed-head">
          <h2 className="app-title">{wholesale ? 'Wholesale picks' : 'Picked for you'}</h2>
          <div className="switch" role="group" aria-label="Prices">
            <button className={wholesale ? '' : 'on'} aria-pressed={!wholesale} onClick={() => setWholesale(false)}>
              Retail
            </button>
            <button className={wholesale ? 'on' : ''} aria-pressed={wholesale} onClick={() => setWholesale(true)}>
              Wholesale
            </button>
          </div>
        </div>
        <div className="feed-views scroll-row">
          {views.map((v) => (
            <button key={v.id} className={view === v.id ? 'on' : ''} aria-pressed={view === v.id} onClick={() => setView(v.id)}>
              {v.label}
            </button>
          ))}
        </div>
        <ProductGrid
          result={feed}
          columns={6}
          auto
          empty={
            <div className="card empty">
              <div className="empty-icon">🏪</div>
              {view === 'for-you' && !wholesale ? (
                <>
                  <h3>Zed Market is just opening</h3>
                  <p className="muted">Shops across Zambia are signing up. Their products will appear here soon.</p>
                  {!user?.isAdmin && (
                    <Link to="/sell" className="btn btn-primary">
                      Open your shop
                    </Link>
                  )}
                </>
              ) : (
                <>
                  <p>Nothing here yet.</p>
                  <button className="btn btn-outline" onClick={() => setView('for-you')}>
                    Show everything
                  </button>
                </>
              )}
            </div>
          }
        />
      </section>
    </div>
  );
}
