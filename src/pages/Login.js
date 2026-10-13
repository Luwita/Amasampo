import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../context/StoreContext';

// Where a signed-in user lands: shop owners go to their dashboard, or to shop setup if they have no shop yet.
const homeFor = (user) =>
  user.isAdmin ? '/admin' : user.shopId ? '/seller' : user.accountType === 'seller' ? '/sell#register' : '/account';

export default function Login() {
  const { user, requestCode, verifyCode } = useStore();
  const [params] = useSearchParams();
  const next = params.get('next');
  const ref = params.get('ref') ?? '';
  const [mode, setMode] = useState(ref ? 'register' : 'login');
  const [step, setStep] = useState('phone');
  const [form, setForm] = useState({ name: '', phone: '', code: '', accountType: 'buyer', referralCode: ref.toUpperCase() });
  const [devCode, setDevCode] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Also performs the redirect right after signing in, so there is only one navigation.
  if (user) return <Navigate to={next?.startsWith('/') ? next : homeFor(user)} replace />;

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const sendCode = (e) => {
    e?.preventDefault();
    run(async () => {
      const res = await requestCode(form.phone);
      setDevCode(res.devCode ?? null);
      setStep('code');
    });
  };

  const confirm = (e) => {
    e.preventDefault();
    run(() =>
      verifyCode({
        phone: form.phone,
        code: form.code.trim(),
        ...(mode === 'register' ? {
              name: form.name.trim(),
              accountType: form.accountType,
              referralCode: form.referralCode.trim().toUpperCase() || undefined,
            } : {}),
      }),
    );
  };

  return (
    <div className="container section narrow">
      <div className="card form-card auth">
        <div className="tabs">
          <button className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>
            Sign in
          </button>
          <button className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>
            Create account
          </button>
        </div>

        {step === 'phone' ? (
          <form onSubmit={sendCode}>
            {mode === 'register' && (
              <>
                <div className="field">
                  <label htmlFor="a-name">Full name</label>
                  <input id="a-name" required value={form.name} onChange={set('name')} autoComplete="name" />
                </div>
                <div className="field">
                  <label htmlFor="a-type">I am a</label>
                  <select id="a-type" value={form.accountType} onChange={set('accountType')}>
                    <option value="buyer">Shopper</option>
                    <option value="business">Business buyer (wholesale)</option>
                    <option value="seller">Shop owner (I want to sell)</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="a-ref">Invite code (optional)</label>
                  <input id="a-ref" value={form.referralCode} onChange={set('referralCode')} placeholder="e.g. ZMA1B2C3" />
                  {form.referralCode && <span className="muted small">🎁 You get a K50 voucher when you join with an invite code.</span>}
                </div>
              </>
            )}
            <div className="field">
              <label htmlFor="a-phone">Phone number</label>
              <input
                id="a-phone"
                type="tel"
                required
                placeholder="097 123 4567"
                value={form.phone}
                onChange={set('phone')}
                autoComplete="tel"
              />
            </div>
            {error && <p className="error">{error}</p>}
            <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
              {busy ? 'Sending…' : 'Send me a code'}
            </button>
            <p className="muted small center">We'll send a 6-digit code by SMS. No password needed.</p>
            <p className="muted small center">
              By continuing you agree to our <Link to="/legal/terms">terms</Link> and{' '}
              <Link to="/legal/privacy">privacy policy</Link>.
            </p>
          </form>
        ) : (
          <form onSubmit={confirm}>
            <p>
              Enter the code we sent to <strong>{form.phone}</strong>.{' '}
              <button type="button" className="link-btn" onClick={() => setStep('phone')}>
                Change number
              </button>
            </p>
            {devCode && (
              <p className="dev-note">
                Test mode (no SMS provider connected). Your code is <strong>{devCode}</strong>
              </p>
            )}
            <div className="field">
              <label htmlFor="a-code">6-digit code</label>
              <input
                id="a-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={form.code}
                onChange={set('code')}
                autoFocus
              />
            </div>
            {error && <p className="error">{error}</p>}
            <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
              {busy ? 'Checking…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
            <button type="button" className="link-btn block center" onClick={sendCode} disabled={busy}>
              Send a new code
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
