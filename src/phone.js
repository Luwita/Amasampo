// Helpers for the phone layout (bottom tabs, compact header), used on phone-sized screens and in the Expo app.
import { useEffect, useState } from 'react';

const PHONE = '(max-width: 820px)';
const matches = () => typeof window.matchMedia === 'function' && window.matchMedia(PHONE).matches;

// True on phone-sized screens, where the app layout replaces the website layout.
export function useIsPhone() {
  const [phone, setPhone] = useState(matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia(PHONE);
    const onChange = () => setPhone(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return phone;
}

// While the on-screen keyboard is up, the bars fixed to the bottom would sit on top of it and cover the form,
// so they are hidden (html.typing in mobile.css) until typing is done.
const TYPED = /^(text|search|tel|number|email|url|password|)$/;
export function watchKeyboard() {
  const typing = (el) => el?.tagName === 'TEXTAREA' || (el?.tagName === 'INPUT' && TYPED.test(el.getAttribute('type') ?? ''));
  document.addEventListener('focusin', (e) => document.documentElement.classList.toggle('typing', typing(e.target)));
  document.addEventListener('focusout', () => document.documentElement.classList.remove('typing'));
}
