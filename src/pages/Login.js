import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import PhoneLink from '../components/PhoneLink';
import { useStore } from '../context/StoreContext';

// Where a signed-in user lands: shop owners go to their dashboard, or to shop setup if they have no shop yet.
const homeFor = (user) =>
  user.isAdmin ? '/admin' : user.shopId ? '/seller' : user.accountType === 'seller' ? '/sell#register' : '/account';

// Sign-up and sign-in, run by Neon Auth: email and password, or Google. A phone number is added right after
// sign-up (by SMS code); once added, it can also be used to sign in with a code.
export default function Login() {
  const { user, signUp, signIn, signInWithGoogle } = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');
  const ref = params.get('ref') ?? '';
  // Sign-up links and QR codes: ?join=seller (shop owners) or ?join=buyer (customers).
  const join = params.get('join');
  const [mode, setMode] = useState(ref || join ? 'register' : 'login');
  const [justJoined, setJustJoined] = useState(false); // show "add your phone" before moving on
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    accountType: join === 'seller' ? 'seller' : 'buyer',
    referralCode: ref.toUpperCase(),
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const destination = (u) => (next?.startsWith('/') ? next : homeFor(u));

  if (user && justJoined && !user.phone) {
    return (
      <div className="container section narrow">
        <div className="card form-card auth">
          <h2>Add your phone number</h2>
          <p className="muted">
            We text you about your orders, and shops use it to reach you. You can also sign in with a code sent to
            this number.
          </p>
          <PhoneLink onDone={() => navigate(destination(user), { replace: true })} />
          <button className="link-btn block center" onClick={() => navigate(destination(user), { replace: true })}>
            Skip for now
          </button>
        </div>
      </div>
    );
  }
  // Also performs the redirect right after signing in, so there is only one navigation.
  if (user) return <Navigate to={destination(user)} replace />;

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (mode === 'register') {
      if (form.name.trim().length < 2) return setError('Enter your full name');
      if (form.password.length < 8) return setError('Use a password of at least 8 characters');
      run(async () => {
        setJustJoined(true);
        await signUp({ ...form, name: form.name.trim(), email: form.email.trim(), referralCode: form.referralCode.trim().toUpperCase() });
      });
    } else {
      run(() => signIn({ email: form.email.trim(), password: form.password }));
    }
  };

  const tabs = (
    <div className="tabs">
      <button className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>
        Sign in
      </button>
      <button className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>
        Create account
      </button>
    </div>
  );

  if (mode === 'phone') {
    return (
      <div className="container section narrow">
        <div className="card form-card auth">
          {tabs}
          <p className="muted small">For accounts that already have this phone number added.</p>
          <PhoneLink link={false} />
          <button className="link-btn block center" onClick={() => setMode('login')}>
            Sign in with email instead
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container section narrow">
      <div className="card form-card auth">
        {tabs}
        <form onSubmit={submit} noValidate>
          {mode === 'register' && (
            <>
              <div className="field">
                <label htmlFor="a-name">Full name</label>
                <input id="a-name" value={form.name} onChange={set('name')} autoComplete="name" />
              </div>
              <div className="field">
                <label htmlFor="a-type">I am a</label>
                <select id="a-type" value={form.accountType} onChange={set('accountType')}>
                  <option value="buyer">Shopper</option>
                  <option value="business">Business buyer (wholesale)</option>
                  <option value="seller">Shop owner (I want to sell)</option>
                </select>
              </div>
            </>
          )}
          <div className="field">
            <label htmlFor="a-email">Email</label>
            <input id="a-email" type="email" value={form.email} onChange={set('email')} autoComplete="email" />
          </div>
          <div className="field">
            <label htmlFor="a-password">Password</label>
            <input
              id="a-password"
              type="password"
              value={form.password}
              onChange={set('password')}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            />
            {mode === 'register' && <span className="muted small">At least 8 characters.</span>}
          </div>
          {mode === 'register' && (
            <div className="field">
              <label htmlFor="a-ref">Invite code (optional)</label>
              <input id="a-ref" value={form.referralCode} onChange={set('referralCode')} placeholder="e.g. ZMA1B2C3" />
              {form.referralCode && <span className="muted small">🎁 You get a voucher when you join with an invite code.</span>}
            </div>
          )}
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <div className="auth-or">or</div>
        <button
          className="btn btn-outline btn-block"
          disabled={busy}
          onClick={() => run(() => signInWithGoogle(`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`))}
        >
          Continue with Google
        </button>
        {mode === 'login' && (
          <button className="btn btn-outline btn-block" disabled={busy} onClick={() => setMode('phone')}>
            Sign in with a code to my phone
          </button>
        )}
        <p className="muted small center">
          By continuing you agree to our <Link to="/legal/terms">terms</Link> and{' '}
          <Link to="/legal/privacy">privacy policy</Link>.
        </p>
      </div>
    </div>
  );
}
