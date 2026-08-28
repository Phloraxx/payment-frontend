import { ArrowRight, CaretDown, Check, CircleNotch, CurrencyInr, ShieldCheck } from '@phosphor-icons/react';
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
  const [chooserOpen, setChooserOpen] = useState(false);
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
        setPaymentAccounts((current) => current.map((account) => ({
          ...account,
          ready: false,
          unavailableReason: 'Verification status is temporarily unavailable.',
        })));
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

  const readyAccounts = useMemo(() => paymentAccounts.filter((account) => account.ready), [paymentAccounts]);
  const selected = paymentAccounts.find((account) => account.id === paymentAccount);
  const canCreate = Boolean(selected?.ready);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const rupees = Number(amount);
    if (!/^[1-9]\d*$/.test(amount.trim()) || !Number.isSafeInteger(rupees) || rupees <= 0) {
      setError('Enter a whole-rupee amount greater than zero.');
      return;
    }
    if (!selected?.ready) {
      setError(selected?.unavailableReason || 'Payment verification is temporarily unavailable.');
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
      setError(requestError instanceof ClientApiError ? requestError.message : 'Unable to create the payment right now.');
      if (requestError instanceof ClientApiError && requestError.code === 'PAYMENT_ACCOUNT_UNAVAILABLE') {
        void getPaymentAccounts().then((config) => setPaymentAccounts(config.accounts)).catch(() => undefined);
      }
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <PageShell>
      <div>
        <p className="paygate-kicker">New payment</p>
        <h1 className="paygate-title mt-4 max-w-[10ch]">Enter the amount. PayGate handles the match.</h1>
        <p className="paygate-copy mt-4 max-w-[48ch]">
          We create one exact UPI amount and verify the matching credit automatically.
        </p>

        <form onSubmit={submit} className="mt-8">
          <label className="block">
            <span className="sr-only">Amount in whole rupees</span>
            <div className="group flex items-center border-b-2 border-black/12 pb-3 transition focus-within:border-black/70">
              <CurrencyInr weight="bold" className="h-8 w-8 shrink-0 text-black/28 sm:h-10 sm:w-10" />
              <input
                autoFocus
                value={amount}
                onChange={(event) => { setAmount(event.target.value); setError(undefined); }}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                placeholder="500"
                aria-label="Amount in whole rupees"
                className="paygate-number min-w-0 flex-1 bg-transparent px-2 text-[3.6rem] font-black leading-none tracking-[-0.065em] text-[#11110f] outline-none placeholder:text-black/12 sm:text-[5.1rem]"
              />
            </div>
          </label>

          <div className="mt-6 rounded-[1.35rem] border border-black/8 bg-black/[0.025] p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-black/35">Verification route</p>
                <p className="mt-1 truncate text-sm font-bold text-black/75">
                  {!availabilityLoaded ? 'Checking availability…' : selected?.ready ? selected.label : 'No route available'}
                </p>
                {selected?.ready && (
                  <p className="mt-0.5 text-xs text-black/42">{verificationLabel(selected)}</p>
                )}
              </div>
              {paymentAccounts.length > 1 && (
                <button type="button" className="paygate-chip shrink-0" onClick={() => setChooserOpen((open) => !open)} aria-expanded={chooserOpen}>
                  Change <CaretDown className={`h-3.5 w-3.5 transition ${chooserOpen ? 'rotate-180' : ''}`} />
                </button>
              )}
            </div>
            {chooserOpen && (
              <div className="mt-3 grid gap-2 border-t border-black/8 pt-3">
                {paymentAccounts.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    disabled={!account.ready}
                    onClick={() => { setPaymentAccount(account.id); setChooserOpen(false); setError(undefined); }}
                    className="flex min-h-12 items-center justify-between gap-4 rounded-2xl px-3 py-2.5 text-left transition hover:bg-white/80 disabled:opacity-40"
                  >
                    <span>
                      <strong className="block text-sm text-black/75">{account.label}</strong>
                      <span className="mt-0.5 block text-xs text-black/40">{account.ready ? verificationLabel(account) : (account.unavailableReason || 'Unavailable')}</span>
                    </span>
                    {account.id === paymentAccount && account.ready && <Check weight="bold" className="h-4 w-4 shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {availabilityLoaded && readyAccounts.length === 0 && (
            <div role="status" className="mt-4 rounded-[1.2rem] border border-amber-900/10 bg-amber-100/55 px-4 py-3 text-sm leading-5 text-amber-950/75">
              Payment verification is temporarily unavailable. No payment session will be created until a verification route is healthy.
            </div>
          )}

          {error && (
            <div role="alert" className="mt-4 rounded-[1.2rem] border border-red-900/10 bg-red-100/60 px-4 py-3 text-sm leading-5 text-red-950/75">
              {error}
            </div>
          )}

          <button type="submit" disabled={submitting || !canCreate} className="button-primary mt-5 min-h-14 rounded-[1.25rem] text-[15px]">
            {submitting ? <CircleNotch className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
            {submitting ? 'Creating secure payment…' : 'Continue'}
          </button>
        </form>

        <div className="mt-5 flex items-start gap-2.5 text-xs leading-5 text-black/42">
          <ShieldCheck weight="duotone" className="mt-0.5 h-4 w-4 shrink-0 text-black/48" />
          <p>The final amount includes a small paise marker used only to identify your payment. Always pay the exact amount shown on the next screen.</p>
        </div>
      </div>
    </PageShell>
  );
}

function verificationLabel(account: PaymentAccountOption): string {
  if (account.verification === 'notification') return account.flow === 'qr_only' ? 'QR · automatic Paytm verification' : 'Automatic notification verification';
  if (account.verification === 'email') return 'Automatic bank-email verification';
  return 'Automatic bank-SMS verification';
}
