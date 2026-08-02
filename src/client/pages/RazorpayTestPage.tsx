import { ArrowLeft, CheckCircle, CircleNotch, CreditCard, WarningCircle, XCircle } from '@phosphor-icons/react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';

import type { RazorpayTestOrder, VerifyRazorpayTestRequest } from '../../shared/razorpay.js';
import { isRazorpayTestTerminal } from '../../shared/razorpay.js';
import { PageShell } from '../components/PageShell';
import { ClientApiError, getRazorpayTestOrder, verifyRazorpayTestOrder } from '../lib/api.js';
import { formatRupeesFromPaise } from '../lib/money.js';

type RazorpayCheckoutResponse = VerifyRazorpayTestRequest;

interface RazorpayCheckoutInstance {
  open(): void;
  on(event: 'payment.failed', callback: (response: { error?: { description?: string } }) => void): void;
}

interface RazorpayCheckoutConstructor {
  new (options: {
    key: string;
    amount: number;
    currency: string;
    name: string;
    description: string;
    order_id: string;
    handler: (response: RazorpayCheckoutResponse) => void;
    modal: { ondismiss: () => void };
    theme: { color: string };
  }): RazorpayCheckoutInstance;
}

declare global {
  interface Window {
    Razorpay?: RazorpayCheckoutConstructor;
  }
}

let checkoutScriptPromise: Promise<void> | undefined;

function loadCheckoutScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (checkoutScriptPromise) return checkoutScriptPromise;
  checkoutScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay-checkout]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Razorpay Checkout failed to load.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.razorpayCheckout = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Razorpay Checkout failed to load.'));
    document.head.append(script);
  });
  return checkoutScriptPromise;
}
export function RazorpayTestPage() {
  const { id = '' } = useParams();
  const [order, setOrder] = useState<RazorpayTestOrder>();
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!id) return;
    try {
      const value = await getRazorpayTestOrder(id, signal);
      setOrder(value);
      setError(undefined);
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
      setError(requestError instanceof ClientApiError ? requestError.message : 'Unable to load the Razorpay test order.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void refresh(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [refresh]);

  useEffect(() => {
    if (!order || isRazorpayTestTerminal(order.status)) return;
    const timer = window.setInterval(() => void refresh(), 2_500);
    return () => window.clearInterval(timer);
  }, [order, refresh]);

  const verify = useCallback(async (response: RazorpayCheckoutResponse) => {
    if (!order) return;
    setOpening(true);
    setMessage('Checkout response received. Verifying with Razorpay…');
    setError(undefined);
    try {
      const updated = await verifyRazorpayTestOrder(order.id, response);
      setOrder(updated);
      setMessage(updated.status === 'captured' ? 'Test payment captured successfully.' : 'Signature verified. Waiting for provider capture confirmation.');
    } catch (requestError) {
      setError(requestError instanceof ClientApiError ? requestError.message : 'Could not verify the Razorpay test payment.');
    } finally {
      setOpening(false);
    }
  }, [order]);
  const openCheckout = async () => {
    if (!order || order.status !== 'created' || !order.razorpayOrderId) return;
    setOpening(true);
    setMessage(undefined);
    setError(undefined);
    try {
      await loadCheckoutScript();
      if (!window.Razorpay) throw new Error('Razorpay Checkout is unavailable.');
      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amountPaise,
        currency: order.currency,
        name: order.displayName,
        description: 'IEEE Sahrdaya Razorpay Test payment',
        order_id: order.razorpayOrderId,
        handler: (response) => void verify(response),
        modal: {
          ondismiss: () => {
            setOpening(false);
            setMessage('Checkout closed. The test order is still available.');
          },
        },
        theme: { color: '#0f172a' },
      });
      checkout.on('payment.failed', (response) => {
        setOpening(false);
        setError(response.error?.description || 'Razorpay reported a failed test payment.');
        void refresh();
      });
      checkout.open();
    } catch (checkoutError) {
      setOpening(false);
      setError(checkoutError instanceof Error ? checkoutError.message : 'Unable to open Razorpay Checkout.');
    }
  };

  if (loading) {
    return <CenteredState icon={<CircleNotch className="h-10 w-10 animate-spin" />} title="Loading test order" description="Checking the isolated Razorpay Test service." />;
  }
  if (!order) {
    return <CenteredState icon={<WarningCircle className="h-10 w-10" />} title="Test order unavailable" description={error || 'The Razorpay test order could not be found.'} />;
  }

  const captured = order.status === 'captured';
  const failed = order.status === 'failed' || order.status === 'create_failed';
  const waiting = !captured && !failed && order.status !== 'created';
  return (
    <PageShell>
      <div className="relative z-10">
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-relaxed text-sky-800">
          <strong>Razorpay Test Mode:</strong> this checkout is simulated. No real money is charged or settled.
        </div>

        <div className="mt-7 text-center">
          <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${captured ? 'bg-emerald-50 text-emerald-700' : failed ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-700'}`}>
            {captured ? <CheckCircle weight="fill" className="h-9 w-9" /> : failed ? <XCircle weight="fill" className="h-9 w-9" /> : waiting ? <CircleNotch className="h-9 w-9 animate-spin" /> : <CreditCard className="h-9 w-9" />}
          </div>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Razorpay Test order</p>
          <h2 className="mt-2 text-3xl font-bold tracking-[-0.04em] text-slate-950">{formatRupeesFromPaise(order.amountPaise)}</h2>
          <p className="mt-2 text-sm text-slate-500">Status: <span className="font-semibold text-slate-800">{order.status.replaceAll('_', ' ')}</span></p>
        </div>

        {captured && (
          <div role="status" className="mt-7 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-center text-sm leading-relaxed text-emerald-800">
            <strong>Test payment captured.</strong> Razorpay and the server both confirmed the simulated payment.
          </div>
        )}
        {failed && (
          <div role="alert" className="mt-7 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-center text-sm leading-relaxed text-red-700">
            <strong>Test payment failed.</strong> {order.error || 'Create another test order to retry.'}
          </div>
        )}
        {message && !captured && <div role="status" className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-center text-sm text-slate-700">{message}</div>}
        {error && <div role="alert" className="mt-7 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-center text-sm text-red-700">{error}</div>}
        {order.status === 'created' && (
          <button onClick={() => void openCheckout()} disabled={opening} className="button-primary mt-7 disabled:cursor-not-allowed disabled:opacity-60">
            {opening ? <CircleNotch className="h-5 w-5 animate-spin" /> : <CreditCard className="h-5 w-5" />}
            {opening ? 'Opening Checkout…' : 'Open Razorpay Test Checkout'}
          </button>
        )}
        {waiting && (
          <button onClick={() => void refresh()} className="button-secondary mt-7">
            <CircleNotch className="h-5 w-5" />
            Check provider status
          </button>
        )}

        <dl className="mt-7 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">Local order</dt><dd className="break-all font-mono text-xs text-slate-700">{order.id}</dd></div>
          <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">Razorpay order</dt><dd className="break-all font-mono text-xs text-slate-700">{order.razorpayOrderId || 'Creating…'}</dd></div>
          {order.razorpayPaymentId && <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">Payment</dt><dd className="break-all font-mono text-xs text-slate-700">{order.razorpayPaymentId}</dd></div>}
        </dl>

        <Link to="/" className="mt-7 flex items-center justify-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-950">
          <ArrowLeft className="h-4 w-4" />
          Start another payment
        </Link>
      </div>
    </PageShell>
  );
}

function CenteredState({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <PageShell>
      <div className="relative z-10 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">{icon}</div>
        <h2 className="mt-5 text-2xl font-bold tracking-tight text-slate-950">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">{description}</p>
        <Link to="/" className="button-secondary mt-7"><ArrowLeft className="h-4 w-4" />Back to payments</Link>
      </div>
    </PageShell>
  );
}
