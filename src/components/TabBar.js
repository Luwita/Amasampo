import { Link, useLocation } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import Icon from './Icon';

// Screens that have their own bar at the bottom (the buy buttons) or need the whole screen.
const HIDDEN = /^\/(product\/|checkout|admin)/;

// Bottom navigation of the phone layout.
export default function TabBar() {
  const { cartCount, user, unreadMessages, toDispatchCount } = useStore();
  const { pathname, search } = useLocation();
  if (HIDDEN.test(pathname)) return null;

  // Signed out, Messages and Me both lead to sign-in: only the one that was tapped lights up.
  const signInFor = pathname === '/login' ? (new URLSearchParams(search).get('next') ?? '/account') : null;
  const at = (...starts) => starts.some((s) => pathname === s || pathname.startsWith(`${s}/`));

  const tabs = [
    { to: '/', icon: 'home', label: 'Home', active: pathname === '/' },
    { to: '/categories', icon: 'grid', label: 'Categories', active: at('/categories', '/shop', '/wholesale', '/stores', '/store') },
    {
      to: user ? '/messages' : '/login?next=/messages',
      icon: 'chat',
      label: 'Messages',
      count: unreadMessages,
      active: at('/messages') || signInFor === '/messages',
    },
    { to: '/cart', icon: 'cart', label: 'Cart', count: cartCount, active: at('/cart') },
    {
      to: user ? '/account' : '/login',
      icon: 'user',
      label: user ? 'Me' : 'Sign in',
      count: toDispatchCount,
      active: at('/account', '/seller', '/sell', '/order') || (signInFor !== null && signInFor !== '/messages'),
    },
  ];

  return (
    <nav className="tabbar" aria-label="App sections">
      {tabs.map((t) => (
        <Link key={t.label} to={t.to} className={`tab ${t.active ? 'active' : ''}`} aria-current={t.active ? 'page' : undefined}>
          <span className="tab-icon">
            <Icon name={t.icon} />
            {t.count > 0 && <span className="badge-count">{t.count > 99 ? '99+' : t.count}</span>}
          </span>
          <span className="tab-label">{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}
