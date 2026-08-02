import { ArrowRight, CircleNotch, CreditCard, CurrencyInr, QrCode } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import { PageShell } from '../components/PageShell';
import { ClientApiError, createPayment, createRazorpayTestOrder, getRazorpayTestConfig } from '../lib/api.js';
import {
  clearCreateDraft,
  clearRazorpayCreateDraft,
  getOrCreateRazorpayRequestId,
  getOrCreateRequestId,
  savePaymentSession,
} from '../lib/session.js';

export function HomePage() {
  const navigate = useNavigate();
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [method, setMethod] = useState<'upi' | 'razorpay-test'>('upi');
  const [razorpayEnabled, setRazorpayEnabled] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void getRazorpayTestConfig()
      .then((config) => { if (active) setRazorpayEnabled(config.enabled); })
      .catch(() => { if (active) setRazorpayEnabled(false); });
    return () => { active = false; };
  }, []);

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
      if (method === 'razorpay-test') {
        if (!razorpayEnabled) throw new ClientApiError('RAZORPAY_TEST_DISABLED', 'Razorpay Test Mode is unavailable.', 404);
        const requestId = getOrCreateRazorpayRequestId(rupees);
        const order = await createRazorpayTestOrder({ amount: rupees, requestId });
        clearRazorpayCreateDraft();
        navigate(`/razorpay-test/${order.id}`);
      } else {
        // Reuse this idempotency key after a lost response so retrying cannot
        // reserve a second DDM amount for the same checkout attempt.
        const requestId = getOrCreateRequestId(rupees);
        const payment = await createPayment({ amount: rupees, requestId });
        savePaymentSession(payment);
        clearCreateDraft();
        navigate(`/pay/${payment.id}`);
      }
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
          Choose direct UPI verification or Razorpay Test Mode, then enter a whole-rupee amount.
        </p>

        <div className="mt-7 grid grid-cols-2 gap-3" role="radiogroup" aria-label="Payment method">
          <button
            type="button"
            role="radio"
            aria-checked={method === 'upi'}
            onClick={() => { setMethod('upi'); setError(undefined); }}
            className={`rounded-2xl border p-4 text-left transition ${method === 'upi' ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}
          >
            <QrCode className="h-6 w-6" />
            <strong className="mt-3 block text-sm">Direct UPI</strong>
            <span className={`mt-1 block text-xs leading-relaxed ${method === 'upi' ? 'text-slate-300' : 'text-slate-500'}`}>Exact QR amount verified by bank SMS.</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={method === 'razorpay-test'}
            disabled={!razorpayEnabled}
            onClick={() => { setMethod('razorpay-test'); setError(undefined); }}
            className={`rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${method === 'razorpay-test' ? 'border-sky-700 bg-sky-700 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}
          >
            <CreditCard className="h-6 w-6" />
            <strong className="mt-3 block text-sm">Razorpay Test</strong>
            <span className={`mt-1 block text-xs leading-relaxed ${method === 'razorpay-test' ? 'text-sky-100' : 'text-slate-500'}`}>{razorpayEnabled ? 'Mock Checkout—no real money.' : 'Temporarily unavailable.'}</span>
          </button>
        </div>

        {method === 'razorpay-test' && razorpayEnabled && (
          <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-relaxed text-sky-800">
            <strong>Test Mode:</strong> Razorpay will simulate the payment. No real money is charged or settled.
          </div>
        )}

        <form onSubmit={submit} className="mt-6 space-y-5">
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
            {submitting ? 'Creating payment…' : method === 'razorpay-test' ? 'Continue to Razorpay Test' : 'Generate UPI payment'}
          </button>
        </form>

        <p className="mt-5 text-center text-xs leading-relaxed text-slate-400">
          {method === 'razorpay-test'
            ? 'Razorpay Test Mode is isolated from the direct-UPI payment records.'
            : 'The payment destination and exact payable amount always come from PayGate.'}
        </p>
      </div>
    </PageShell>
  );
}
