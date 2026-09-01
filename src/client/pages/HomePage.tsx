import { ArrowRight, CircleNotch, CurrencyInr, ShieldCheck } from '@phosphor-icons/react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { PageShell } from '../components/PageShell';
import { ClientApiError, createPayment } from '../lib/api.js';
import { clearCreateDraft, getOrCreateRequestId, savePaymentSession } from '../lib/session.js';

export function HomePage() {
  const navigate = useNavigate();
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const [eventId, setEventId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const rupees = Number(amount);
    const cleanName = name.trim();
    const cleanEventId = eventId.trim();
    if (!/^[1-9]\d*$/.test(amount.trim()) || !Number.isSafeInteger(rupees) || rupees <= 0) {
      setError('Enter a whole-rupee amount greater than zero.');
      return;
    }
    if (!cleanName || cleanName.length > 120) {
      setError('Enter the person or payment identifier.');
      return;
    }
    if (!cleanEventId || cleanEventId.length > 255) {
      setError('Enter the event ID.');
      return;
    }

    setSubmitting(true);
    setError(undefined);
    try {
      const requestId = getOrCreateRequestId(rupees, cleanName, cleanEventId);
      const payment = await createPayment({ amount: rupees, name: cleanName, externalId: cleanEventId, requestId });
      savePaymentSession(payment);
      clearCreateDraft();
      navigate(`/pay/${payment.id}`);
    } catch (requestError) {
      setError(requestError instanceof ClientApiError ? requestError.message : 'Unable to start this payment right now.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell>
      <div className="checkout-entry">
        <div>
          <p className="paygate-kicker">PayGate v4 test</p>
          <h1 className="checkout-title">Create a payment.</h1>
          <p className="checkout-copy">The client sends only amount, person identifier and event ID. PayGate chooses where the money goes.</p>
        </div>

        <form onSubmit={submit} className="checkout-form">
          <label className="amount-label">
            <span className="sr-only">Amount in whole rupees</span>
            <div className="amount-line">
              <CurrencyInr weight="bold" className="amount-symbol" />
              <input autoFocus value={amount} onChange={(event) => { setAmount(event.target.value.replace(/\D/g, '')); setError(undefined); }}
                inputMode="numeric" pattern="[0-9]*" autoComplete="off" placeholder="500" aria-label="Amount in whole rupees"
                className="checkout-amount paygate-number" />
            </div>
          </label>

          <div className="checkout-meta-grid">
            <label><span>Person / payment name</span><input value={name} onChange={(event) => { setName(event.target.value); setError(undefined); }}
              maxLength={120} autoComplete="name" placeholder="Sourav P Bijoy" className="checkout-meta-input" /></label>
            <label><span>Event ID</span><input value={eventId} onChange={(event) => { setEventId(event.target.value); setError(undefined); }}
              maxLength={255} autoComplete="off" placeholder="evt_hardware_security_2026" className="checkout-meta-input font-mono" /></label>
          </div>

          <div className="checkout-trust-row">
            <div><span className="trust-dot" /><span>Server-routed UPI</span></div>
            <div><ShieldCheck weight="duotone" /><span>Automatic confirmation</span></div>
          </div>

          {error && <div role="alert" className="checkout-error">{error}</div>}
          <button type="submit" disabled={submitting} className="button-primary checkout-continue">
            {submitting ? <CircleNotch className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
            {submitting ? 'Creating payment…' : 'Continue'}
          </button>
        </form>

        <p className="checkout-footnote">PayGate returns one canonical UPI string. This test client renders the QR and polls only the payment status.</p>
      </div>
    </PageShell>
  );
}
