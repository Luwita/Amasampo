import { useState } from 'react';
import { useStore } from '../context/StoreContext';

const PHONE = /^(\+?260|0)?[79]\d{8}$/;

// Verifies a phone number with a 6-digit SMS code. `link`: add it to the signed-in account (needed for order
// texts, and to sign in with a code later); otherwise sign in with a number already on an account.
// In test mode (SMS not paid for yet) the code is also shown on screen.
export default function PhoneLink({ link = true, onDone, submitLabel }) {
  const { sendPhoneCode, verifyPhone, testCode } = useStore();
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [shownCode, setShownCode] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

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

  const send = (e) => {
    e?.preventDefault();
    if (!PHONE.test(phone.replace(/\s/g, ''))) {
      setError('Enter a valid Zambian mobile number, e.g. 097 123 4567');
      return;
    }
    run(async () => {
      await sendPhoneCode(phone);
      setStep('code');
      const { code: test } = await testCode(phone);
      setShownCode(test ?? null);
    });
  };

  const confirm = (e) => {
    e.preventDefault();
    run(async () => {
      await verifyPhone({ phone, code: code.trim(), link });
      onDone?.();
    });
  };

  if (step === 'phone') {
    return (
      <form onSubmit={send} noValidate>
        <div className="field">
          <label htmlFor="pl-phone">Phone number</label>
          <input
            id="pl-phone"
            type="tel"
            placeholder="097 123 4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
          />
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Sending…' : 'Send me a code'}
        </button>
      </form>
    );
  }
  return (
    <form onSubmit={confirm}>
      <p>
        Enter the code we sent to <strong>{phone}</strong>.{' '}
        <button type="button" className="link-btn" onClick={() => setStep('phone')}>
          Change number
        </button>
      </p>
      {shownCode && (
        <p className="dev-note">
          Test mode. Your code is <strong>{shownCode}</strong>
        </p>
      )}
      <div className="field">
        <label htmlFor="pl-code">6-digit code</label>
        <input
          id="pl-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoFocus
        />
      </div>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primary btn-block" disabled={busy}>
        {busy ? 'Checking…' : submitLabel ?? (link ? 'Add phone number' : 'Sign in')}
      </button>
      <button type="button" className="link-btn block center" onClick={send} disabled={busy}>
        Send a new code
      </button>
    </form>
  );
}
