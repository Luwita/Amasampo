import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api';
import { ProductRow } from '../components/ProductGrid';
import { useStore } from '../context/StoreContext';
import { bannerThemes } from '../data/bannerThemes';
import { categories } from '../data/catalog';
import { getProvince, provinces } from '../data/zambia';
import { useProductSearch } from '../hooks/useProducts';

const standardSlides = [
  {
    title: 'Beat load-shedding',
    text: 'Solar panels, inverters & lithium batteries from trusted local shops at wholesale Kwacha prices.',
    cta: 'Shop Solar & Power',
    to: '/shop?cat=solar',
    bg: 'linear-gradient(120deg, #0b6e4f 0%, #198754 55%, #f9a825 140%)',
    icon: '☀️',
  },
  {
    title: 'Wholesale for your shop',
    text: 'Buy in bulk from sellers across Zambia. Prices drop as your order grows. Pay with Mobile Money.',
    cta: 'Start buying wholesale',
    to: '/wholesale',
    bg: 'linear-gradient(120deg, #c2410c 0%, #ea580c 60%, #fbbf24 140%)',
    icon: '📦',
  },
  {
    title: 'Delivered by Zambian couriers',
    text: 'Yango Delivery in town, Platinum Couriers, bus parcels and Zampost between provinces, or collect from the shop.',
    cta: 'See delivery options',
    to: '/delivery',
    bg: 'linear-gradient(120deg, #111827 0%, #1f2937 55%, #198754 140%)',
    icon: '🛵',
  },
];

const promises = [
  { icon: '🇿🇲', title: 'Local shops', text: 'Verified sellers in all 10 provinces' },
  { icon: '🔒', title: 'Safe payment', text: 'Money held until you confirm delivery' },
  { icon: '🛵', title: 'Zambian couriers', text: 'Yango, Platinum, bus parcel, Zampost' },
  { icon: '🤝', title: '1-on-1 seller support', text: 'Help to list products and start selling' },
];

export default function Home() {
  const { shops, location, lowData } = useStore();
  const [slide, setSlide] = useState(0);
  const [stats, setStats] = useState({});
  const [banners, setBanners] = useState([]);

  useEffect(() => {
    api
      .provinceStats()
      .then(setStats)
      .catch(() => {});
  }, []);

  // Campaign banners set by Zed Market staff come before the standard slides.
  useEffect(() => {
    api
      .banners()
      .then((list) =>
        setBanners(
          list.map((b) => ({ title: b.title, text: b.text, cta: b.cta, to: b.link, bg: bannerThemes[b.theme], image: b.image })),
        ),
      )
      .catch(() => {});
  }, []);
  const slides = [...banners, ...standardSlides];

  useEffect(() => {
    if (lowData) return undefined; // no automatic carousel in low-data mode
    const t = setInterval(() => setSlide((s) => (s + 1) % slides.length), 6000);
    return () => clearInterval(t);
  }, [lowData, slides.length]);

  const province = getProvince(location.province);
  const near = useProductSearch({
    prov: location.province,
    sort: 'nearest',
    nearProv: location.province,
    nearTown: location.town,
    limit: 12,
  }).items;
  const deals = useProductSearch({ sort: 'deals', limit: 12 }).items;
  const featured = useProductSearch({ featured: '1', sort: 'popular', limit: 12 }).items;
  const local = useProductSearch({ local: '1', sort: 'popular', limit: 12 }).items;
  const popular = useProductSearch({ sort: 'popular', limit: 24 }).items;
  const shopsNearby = shops.filter((s) => s.province === location.province).length;

  const s = slides[slide % slides.length];

  return (
    <div className="home">
      <section className="container hero-grid">
        <aside className="card cat-side">
          <h3>Categories</h3>
          {categories.map((c) => (
            <Link key={c.id} to={`/shop?cat=${c.id}`}>
              <span>{c.icon}</span> {c.name}
            </Link>
          ))}
        </aside>

        <div className="hero" style={{ background: s.bg }}>
          <div className="hero-copy">
            <span className="hero-kicker">ZED MARKET · Zambia's marketplace</span>
            <h1>{s.title}</h1>
            <p>{s.text}</p>
            <Link to={s.to} className="btn btn-light">
              {s.cta} →
            </Link>
          </div>
          {s.image && !lowData ? (
            <img className="hero-image" src={s.image} alt="" />
          ) : (
            s.icon && <div className="hero-icon">{s.icon}</div>
          )}
          <div className="dots">
            {slides.map((_, i) => (
              <button
                key={i}
                className={i === slide % slides.length ? 'on' : ''}
                aria-label={`Slide ${i + 1}`}
                onClick={() => setSlide(i)}
              />
            ))}
          </div>
        </div>

        <aside className="hero-side">
          <div className="card side-card side-accent">
            <h4>📍 Shopping in {location.town}</h4>
            <p>
              {shopsNearby} shop{shopsNearby === 1 ? '' : 's'} in {province?.name} Province. Change your location at the
              top of the page.
            </p>
            <Link
              to={`/shop?prov=${location.province}&town=${encodeURIComponent(location.town)}`}
              className="btn btn-outline btn-sm btn-block"
            >
              Shop near me
            </Link>
          </div>
          <div className="card side-card">
            <h4>Own a shop?</h4>
            <p>Upload your products and sell to buyers across Zambia. Free to join.</p>
            <Link to="/sell" className="btn btn-primary btn-sm btn-block">
              Open your shop
            </Link>
          </div>
        </aside>
      </section>

      <section className="container promises">
        {promises.map((p) => (
          <div key={p.title} className="promise">
            <span className="promise-icon">{p.icon}</span>
            <div>
              <strong>{p.title}</strong>
              <p>{p.text}</p>
            </div>
          </div>
        ))}
      </section>

      {near.length > 0 && (
        <section className="container section">
          <div className="section-head">
            <h2>📍 Near you in {province?.name}</h2>
            <Link to={`/shop?prov=${location.province}`}>See all →</Link>
          </div>
          <ProductRow items={near} />
        </section>
      )}

      {featured.length > 0 && (
        <section className="container section">
          <div className="section-head">
            <h2>⭐ Featured by shops</h2>
            <span className="muted small">Promoted by the shops that sell them</span>
          </div>
          <ProductRow items={featured} />
        </section>
      )}

      <section className="container section">
        <div className="section-head deals-head">
          <h2>⚡ Flash deals</h2>
          <Link to="/shop?sort=deals">See all →</Link>
        </div>
        <ProductRow items={deals} />
      </section>

      <section className="container section">
        <div className="section-head">
          <h2>Shop by province</h2>
          <Link to="/stores">All shops →</Link>
        </div>
        <div className="province-grid">
          {provinces.map((p) => {
            const count = stats[p.id]?.products ?? 0;
            return (
              <Link
                key={p.id}
                to={`/shop?prov=${p.id}`}
                className={`province-tile ${p.id === location.province ? 'mine' : ''}`}
              >
                <strong>{p.name}</strong>
                <span className="muted small">{count} products</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="container section">
        <div className="section-head">
          <h2>Shop by category</h2>
        </div>
        <div className="cat-grid">
          {categories.map((c) => (
            <Link key={c.id} to={`/shop?cat=${c.id}`} className="cat-tile" style={{ '--tint': c.color }}>
              <span className="cat-icon">{c.icon}</span>
              <span>{c.name}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="container section">
        <div className="wholesale-banner">
          <div>
            <h2>Stock your shop for less</h2>
            <p>
              Order in bulk from sellers in Kamwala, Chisokone, Chipata and beyond. Prices fall automatically, and the
              goods reach you by courier or bus parcel.
            </p>
          </div>
          <Link to="/wholesale" className="btn btn-light">
            Browse wholesale
          </Link>
        </div>
      </section>

      <section className="container section">
        <div className="section-head">
          <h2>🇿🇲 Made in Zambia</h2>
          <Link to="/shop?local=1">See all →</Link>
        </div>
        <ProductRow items={local} />
      </section>

      <section className="container section">
        <div className="section-head">
          <h2>Popular across Zambia</h2>
          <Link to="/shop?sort=popular">See all →</Link>
        </div>
        <ProductRow items={popular} rows={2} />
      </section>
    </div>
  );
}
