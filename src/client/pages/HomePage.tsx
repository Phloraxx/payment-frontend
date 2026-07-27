import { ArrowRight, CircleNotch, CurrencyInr } from '@phosphor-icons/react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { PageShell } from '../components/PageShell';
import { ClientApiError, createPayment } from '../lib/api.js';
import { clearCreateDraft, getOrCreateRequestId, savePaymentSession } from '../lib/session.js';

export function HomePage() {
  const navigate = useNavigate();
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const rupees = Number(amount);
    if (!/^[1-9]\d*$/.test(amount.trim()) || !Number.isSafeInteger(rupees) || rupees <= 0) {
      setError('Enter a positive whole-rupee amount, for example 100.');
      return;
    }

    setSubmitting(true);
    setError(undefined);
    try {
      // Reuse this idempotency key after a lost response so retrying cannot
      // reserve a second DDM amount for the same checkout attempt.
      const requestId = getOrCreateRequestId(rupees);
      const payment = await createPayment({ amount: rupees, requestId });
      savePaymentSession(payment);
      clearCreateDraft();
      navigate(`/pay/${payment.id}`);
    } catch (requestError) {
      setError(requestError instanceof ClientApiError ? requestError.message : 'Unable to create the payment right now.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell>
      <div className="relative z-10">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">New payment</p>
        <h2 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-slate-950">How much should be paid?</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-500">
          Enter the original amount in whole rupees. PayGate will add a small paise verification adjustment.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-5">
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Amount</span>
            <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 transition focus-within:border-slate-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-slate-100">
              <CurrencyInr className="h-6 w-6 text-slate-400" />
              <input
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setError(undefined);
                }}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                placeholder="100"
                aria-label="Amount in whole rupees"
                className="min-w-0 flex-1 bg-transparent px-2 py-4 text-2xl font-semibold tracking-tight outline-none placeholder:text-slate-300"
              />
            </div>
          </label>

          {error && (
            <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-4 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? <CircleNotch className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
            {submitting ? 'Creating payment…' : 'Generate payment'}
          </button>
        </form>

        <p className="mt-5 text-center text-xs leading-relaxed text-slate-400">
          The payment destination and exact payable amount always come from PayGate.
        </p>
      </div>
    </PageShell>
  );
}
