import { CircleNotch, CurrencyInr, ShieldWarning } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import { PageShell } from '../components/PageShell';
import { ClientApiError, createRazorpayLiveOrder, getRazorpayLiveConfig } from '../lib/api.js';
import { clearRazorpayLiveCreateDraft, getOrCreateRazorpayLiveRequestId } from '../lib/session.js';

export function RazorpayLivePilotPage() {
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void getRazorpayLiveConfig()
      .then((config) => { if (active) setEnabled(config.enabled); })
      .catch((requestError) => {
        if (active) setError(requestError instanceof ClientApiError ? requestError.message : 'Live pilot is unavailable.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const create = async () => {
    if (!enabled || creating) return;
    setCreating(true);
    setError(undefined);
    try {
      const requestId = getOrCreateRazorpayLiveRequestId(1);
      const order = await createRazorpayLiveOrder({ amount: 1, requestId });
      clearRazorpayLiveCreateDraft();
      navigate(`/razorpay-live/${order.id}`);
    } catch (requestError) {
      setError(requestError instanceof ClientApiError ? requestError.message : 'Could not create the ₹1 Live order.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <PageShell brandVariant="razorpay-live">
      <div className="relative z-10 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
          <ShieldWarning className="h-9 w-9" />
        </div>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-amber-600">Hidden Live pilot</p>
        <h2 className="mt-2 text-3xl font-bold tracking-[-0.04em] text-slate-950">Real ₹1 payment</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-500">
          This uses Razorpay Live Mode. Completing the bank step will charge ₹1 and create a real transaction.
        </p>
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800">
          The pilot is capped server-side at exactly ₹1. Test Mode and direct UPI remain separate.
        </div>
        {error && <div role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        <button
          type="button"
          onClick={() => void create()}
          disabled={loading || !enabled || creating}
          className="button-primary mt-7 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {creating || loading ? <CircleNotch className="h-5 w-5 animate-spin" /> : <CurrencyInr className="h-5 w-5" />}
          {loading ? 'Checking Live service…' : creating ? 'Creating ₹1 order…' : enabled ? 'Create real ₹1 order' : 'Live pilot unavailable'}
        </button>
      </div>
    </PageShell>
  );
}
