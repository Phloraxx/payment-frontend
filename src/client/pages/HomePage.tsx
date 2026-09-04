import { ArrowRight, CircleNotch, CurrencyInr, LockKey, ShieldCheck } from '@phosphor-icons/react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { PageShell } from '../components/PageShell';
import { ClientApiError, createPayment } from '../lib/api.js';
import { clearCreateDraft, getOrCreateRequestId, savePaymentSession } from '../lib/session.js';

const TEST_PAYMENT_NAME = 'Testing';
const TEST_EVENT_ID = 'payment_frontend_testing';
const TEST_EVENT_LABEL = 'Payment Frontend Testing';

export function HomePage() {
  const navigate = useNavigate();
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const rupees = Number(amount);
    if (!/^[1-9]\d*$/.test(amount.trim()) || !Number.isSafeInteger(rupees) || rupees <= 0) {
      setError('Enter a whole-rupee amount greater than zero.');
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      const requestId = getOrCreateRequestId(rupees, TEST_PAYMENT_NAME, TEST_EVENT_ID);
      const payment = await createPayment({ amount: rupees, name: TEST_PAYMENT_NAME, externalId: TEST_EVENT_ID, requestId });
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
      <div className="checkout-entry paygate-enter">
        <div>
          <p className="paygate-kicker">PayGate v4 test</p>
          <h1 className="checkout-title">Create a payment.</h1>
          <p className="checkout-copy">This testing client only asks for the amount. Payment context is fixed, while PayGate chooses the active UPI destination.</p>
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

          <div className="checkout-context-grid" aria-label="Fixed payment context">
            <div className="checkout-context-card">
              <span>Payment name</span>
              <strong>{TEST_PAYMENT_NAME}</strong>
              <LockKey weight="bold" aria-hidden="true" />
            </div>
            <div className="checkout-context-card">
              <span>Event</span>
              <strong>{TEST_EVENT_LABEL}</strong>
              <LockKey weight="bold" aria-hidden="true" />
            </div>
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

        <p className="checkout-footnote">Testing context is locked for this frontend. PayGate returns the canonical UPI instruction; this client renders it and watches payment status.</p>
      </div>
    </PageShell>
  );
}
