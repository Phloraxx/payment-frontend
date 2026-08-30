import { ArrowRight, CircleNotch, CurrencyInr, ShieldCheck } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import type { PaymentAccountId, PaymentAccountOption } from '../../shared/payment.js';
import { PageShell } from '../components/PageShell';
import { ClientApiError, createPayment, getPaymentAccounts } from '../lib/api.js';
import { clearCreateDraft, getOrCreateRequestId, savePaymentSession } from '../lib/session.js';

export function HomePage() {
  const navigate = useNavigate();
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [paymentAccount, setPaymentAccount] = useState<PaymentAccountId>('kotak');
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccountOption[]>([]);
  const [availabilityLoaded, setAvailabilityLoaded] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    const loadAccounts = async () => {
      try {
        const config = await getPaymentAccounts();
        if (!active) return;
        setPaymentAccounts(config.accounts);
        setAvailabilityLoaded(true);
        setPaymentAccount((current) => {
          if (config.accounts.some((account) => account.id === current && account.ready)) return current;
          return config.accounts.find((account) => account.id === config.default && account.ready)?.id
            ?? config.accounts.find((account) => account.ready)?.id
            ?? current;
        });
      } catch {
        if (!active) return;
        setAvailabilityLoaded(true);
        setPaymentAccounts([]);
      }
    };
    void loadAccounts();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadAccounts();
    }, 15_000);
    const onVisibility = () => { if (document.visibilityState === 'visible') void loadAccounts(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const selected = useMemo(
    () => paymentAccounts.find((account) => account.id === paymentAccount && account.ready),
    [paymentAccount, paymentAccounts],
  );
  const canCreate = Boolean(selected);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const rupees = Number(amount);
    if (!/^[1-9]\d*$/.test(amount.trim()) || !Number.isSafeInteger(rupees) || rupees <= 0) {
      setError('Enter a whole-rupee amount greater than zero.');
      return;
    }
    if (!selected) {
      setError('Payments are temporarily unavailable. Please try again shortly.');
      return;
    }

    setSubmitting(true);
    setError(undefined);
    try {
      const requestId = getOrCreateRequestId(rupees, paymentAccount);
      const payment = await createPayment({ amount: rupees, requestId, paymentAccount });
      savePaymentSession(payment);
      clearCreateDraft();
      navigate(`/pay/${payment.id}`);
    } catch (requestError) {
      setError(requestError instanceof ClientApiError ? requestError.message : 'Unable to start this payment right now.');
      if (requestError instanceof ClientApiError && requestError.code === 'PAYMENT_ACCOUNT_UNAVAILABLE') {
        void getPaymentAccounts().then((config) => setPaymentAccounts(config.accounts)).catch(() => undefined);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell>
      <div className="checkout-entry">
        <div>
          <p className="paygate-kicker">UPI payment</p>
          <h1 className="checkout-title">Make a payment.</h1>
          <p className="checkout-copy">Enter the amount and PayGate will take care of the rest.</p>
        </div>

        <form onSubmit={submit} className="checkout-form">
          <label className="amount-label">
            <span className="sr-only">Amount in whole rupees</span>
            <div className="amount-line">
              <CurrencyInr weight="bold" className="amount-symbol" />
              <input
                autoFocus
                value={amount}
                onChange={(event) => { setAmount(event.target.value.replace(/\D/g, '')); setError(undefined); }}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                placeholder="500"
                aria-label="Amount in whole rupees"
                className="checkout-amount paygate-number"
              />
            </div>
          </label>

          <div className="checkout-trust-row">
            <div><span className="trust-dot" /><span>Secure UPI</span></div>
            <div><ShieldCheck weight="duotone" /><span>Automatic verification</span></div>
          </div>

          {availabilityLoaded && !canCreate && (
            <div role="status" className="checkout-warning">
              Payments are temporarily unavailable. PayGate will not start a session until a payment route is healthy.
            </div>
          )}

          {error && <div role="alert" className="checkout-error">{error}</div>}

          <button type="submit" disabled={submitting || !canCreate} className="button-primary checkout-continue">
            {submitting ? <CircleNotch className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
            {submitting ? 'Starting payment…' : 'Continue'}
          </button>
        </form>

        <p className="checkout-footnote">
          You will see the final exact amount before paying. PayGate confirms the payment automatically when it arrives.
        </p>
      </div>
    </PageShell>
  );
}
