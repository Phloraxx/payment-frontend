import { ArrowRight, CurrencyInr, QrCode } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

import { PageShell } from '../components/PageShell';

const PAYTM_VPA = 'paytm.s3nizks@pty';
const PRESETS = ['1.01', '1.02', '1.03', '1.04', '1.06'] as const;

function validPilotAmount(value: string): boolean {
  if (!/^\d+\.\d{2}$/.test(value)) return false;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 1 && amount <= 10;
}

export function PaytmUpiTestPage() {
  const [amount, setAmount] = useState('1.01');
  const [error, setError] = useState<string>();

  const upiUri = useMemo(() => {
    if (!validPilotAmount(amount)) return '';
    const params = new URLSearchParams({
      pa: PAYTM_VPA,
      am: amount,
      cu: 'INR',
    });
    return `upi://pay?${params.toString()}`;
  }, [amount]);

  const changeAmount = (nextAmount: string) => {
    setAmount(nextAmount);
    setError(validPilotAmount(nextAmount) ? undefined : 'Use an exact amount from ₹1.00 to ₹10.00 with two decimal places.');
  };

  return (
    <PageShell>
      <div className="relative z-10">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">Hidden pilot</p>
        <h2 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-slate-950">Paytm Business UPI intent test</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-500">
          This tests the Paytm Business VPA with only the payee, amount and currency in the UPI payload. It does not mark a payment as successful on its own.
        </p>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Merchant VPA</p>
          <p className="mt-1 break-all font-mono text-sm font-semibold text-slate-800">{PAYTM_VPA}</p>
        </div>

        <div className="mt-5">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Quick test amounts</p>
          <div className="mt-2 grid grid-cols-5 gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => changeAmount(preset)}
                className={`rounded-xl border px-2 py-2 text-xs font-semibold transition ${amount === preset ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}
              >
                ₹{preset}
              </button>
            ))}
          </div>
        </div>

        <label className="mt-5 block">
          <span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Exact test amount</span>
          <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 transition focus-within:border-slate-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-slate-100">
            <CurrencyInr className="h-6 w-6 text-slate-400" />
            <input
              value={amount}
              onChange={(event) => changeAmount(event.target.value)}
              inputMode="decimal"
              autoComplete="off"
              aria-label="Exact Paytm UPI test amount"
              className="min-w-0 flex-1 bg-transparent px-2 py-4 text-2xl font-semibold tracking-tight outline-none"
            />
          </div>
        </label>

        {error && (
          <div role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-700">
            {error}
          </div>
        )}

        {upiUri && (
          <>
            <div className="mt-6 flex justify-center rounded-3xl border border-slate-200 bg-white p-5">
              <QRCodeSVG value={upiUri} size={220} level="M" marginSize={1} />
            </div>

            <a
              href={upiUri}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-4 font-semibold text-white transition hover:bg-slate-800"
            >
              <ArrowRight className="h-5 w-5" />
              Open UPI app · ₹{amount}
            </a>

            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
              <strong>Real-money pilot:</strong> verify the payee shown in your UPI app before approving. Start with ₹1.01. A browser return is not treated as proof of payment.
            </div>

            <details className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
              <summary className="cursor-pointer font-semibold text-slate-700">Show generated UPI URI</summary>
              <p className="mt-3 break-all font-mono leading-relaxed">{upiUri}</p>
            </details>
          </>
        )}

        <div className="mt-5 flex items-start gap-3 text-xs leading-relaxed text-slate-400">
          <QrCode className="mt-0.5 h-5 w-5 shrink-0" />
          <p>The QR and button contain only pa, am and cu. No note, Paytm gateway order, callback or signature is involved.</p>
        </div>
      </div>
    </PageShell>
  );
}
