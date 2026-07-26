import {
  ArrowLeft,
  ArrowSquareOut,
  Check,
  CheckCircle,
  CircleNotch,
  Copy,
  DownloadSimple,
  Hourglass,
  QrCode,
  WarningCircle,
  XCircle,
} from '@phosphor-icons/react';
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { QRCodeSVG } from 'qrcode.react';

import type { PublicPayment } from '../../shared/payment.js';
import { PageShell } from '../components/PageShell';
import { StatusBadge } from '../components/StatusBadge';
import { useCountdown } from '../hooks/useCountdown.js';
import { usePaymentStatus } from '../hooks/usePaymentStatus.js';
import { formatCountdown, formatRupeesFromPaise, verificationAdjustmentPaise } from '../lib/money.js';

export function PaymentPage() {
  const { id = '' } = useParams();
  const { payment, loading, refreshing, error, refresh } = usePaymentStatus(id);

  if (loading && !payment) {
    return (
      <PageShell>
        <CenteredState icon={<CircleNotch className="h-9 w-9 animate-spin" />} title="Loading payment" description="Checking the latest PayGate status…" />
      </PageShell>
    );
  }

  if (!payment) {
    return (
      <PageShell>
        <CenteredState
          icon={<WarningCircle className="h-10 w-10" />}
          title="Payment unavailable"
          description={error ?? 'This payment could not be found.'}
          action={<Link to="/" className="button-secondary">Create a new payment</Link>}
        />
      </PageShell>
    );
  }

  if (payment.status === 'pending') {
    return <PendingPayment payment={payment} refreshing={refreshing} error={error} onRefresh={refresh} />;
  }

  return <ResolvedPayment payment={payment} />;
}

function PendingPayment({
  payment,
  refreshing,
  error,
  onRefresh,
}: {
  payment: PublicPayment;
  refreshing: boolean;
  error?: string;
  onRefresh: () => Promise<void>;
}) {
  const secondsLeft = useCountdown(payment.expiresAt);
  const qrContainer = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const adjustment = verificationAdjustmentPaise(payment.requestedAmountPaise, payment.payableAmountPaise);

  const copyAmount = async () => {
    try {
      await navigator.clipboard.writeText(payment.payableAmount);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access may be unavailable in some browsers; the amount is
      // still prominently visible and can be copied manually.
    }
  };

  const downloadQr = () => {
    const svg = qrContainer.current?.querySelector('svg');
    if (!svg) return;
    const serialised = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([serialised], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `upi-payment-${payment.id}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PageShell>
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Payment session</p>
            <h2 className="mt-2 text-2xl font-bold tracking-[-0.035em] text-slate-950">Pay exactly</h2>
          </div>
          <StatusBadge status="pending" refreshing={refreshing} />
        </div>

        <div className="mt-5 flex items-end justify-between gap-3" aria-live="polite">
          <p className="text-4xl font-bold tracking-[-0.05em] text-slate-950">{formatRupeesFromPaise(payment.payableAmountPaise)}</p>
          <button onClick={copyAmount} className="button-icon" aria-label="Copy exact amount" title="Copy exact amount">
            {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
          </button>
        </div>

        {payment.upiUri ? (
          <>
            <div ref={qrContainer} id="qr-code-container" className="mx-auto mt-7 flex aspect-square w-full max-w-[280px] items-center justify-center rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <QRCodeSVG value={payment.upiUri} level="M" size={250} className="h-full w-full" bgColor="#ffffff" fgColor="#0f172a" />
            </div>

            <a href={payment.upiUri} className="button-primary mt-6">
              <ArrowSquareOut className="h-5 w-5" />
              Open UPI app
            </a>
          </>
        ) : (
          <div className="mt-7 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-center">
            <QrCode className="mx-auto h-8 w-8 text-amber-700" />
            <p className="mt-3 font-semibold text-amber-900">QR unavailable after this session was restored</p>
            <p className="mt-1 text-sm leading-relaxed text-amber-700">
              Status checking still works. Create a new payment if you need the QR again.
            </p>
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Detail label="Requested" value={formatRupeesFromPaise(payment.requestedAmountPaise)} />
          <Detail label="Verification" value={`+${formatRupeesFromPaise(adjustment)}`} />
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-600">
          The extra paise identifies this payment. <strong className="font-semibold text-slate-900">Do not change the amount</strong> in your UPI app.
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-dashed border-slate-200 pt-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Time remaining</p>
            <p className="mt-1 font-mono text-xl font-semibold text-slate-900">{formatCountdown(secondsLeft)}</p>
          </div>
          {payment.upiUri && (
            <button onClick={downloadQr} className="button-secondary !w-auto !px-4">
              <DownloadSimple className="h-4 w-4" />
              Save QR
            </button>
          )}
        </div>

        {error && (
          <div role="status" className="mt-4 flex items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span>Connection issue: {error}</span>
            <button onClick={() => void onRefresh()} className="shrink-0 font-semibold underline underline-offset-2">Retry</button>
          </div>
        )}

        <p className="mt-5 break-all text-center font-mono text-[11px] text-slate-400">Payment ID: {payment.id}</p>
      </div>
    </PageShell>
  );
}

function ResolvedPayment({ payment }: { payment: PublicPayment }) {
  if (payment.status === 'pending') return null;

  const content = {
    paid: {
      icon: <CheckCircle weight="fill" className="h-11 w-11" />,
      title: 'Payment verified',
      description: 'The bank credit was matched successfully.',
      tone: 'text-emerald-700 bg-emerald-50',
    },
    expired: {
      icon: <Hourglass className="h-11 w-11" />,
      title: 'Payment expired',
      description: 'This payment window ended before a matching bank credit was verified.',
      tone: 'text-slate-700 bg-slate-100',
    },
    cancelled: {
      icon: <XCircle className="h-11 w-11" />,
      title: 'Payment cancelled',
      description: 'This payment session is no longer active.',
      tone: 'text-slate-700 bg-slate-100',
    },
    late: {
      icon: <WarningCircle className="h-11 w-11" />,
      title: 'Payment received late',
      description: 'The money arrived after this payment session had already ended. Keep the payment ID for manual review.',
      tone: 'text-orange-700 bg-orange-50',
    },
  }[payment.status];

  if (!content) return null;

  return (
    <PageShell>
      <div className="relative z-10 text-center">
        <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${content.tone}`}>{content.icon}</div>
        <div className="mt-5"><StatusBadge status={payment.status} /></div>
        <h2 className="mt-5 text-3xl font-bold tracking-[-0.045em] text-slate-950">{content.title}</h2>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-slate-500">{content.description}</p>

        <div className="mt-8 space-y-3 text-left">
          <Detail label={payment.status === 'paid' || payment.status === 'late' ? 'Amount received' : 'Payment amount'} value={formatRupeesFromPaise(payment.payableAmountPaise)} />
          <Detail label="Requested amount" value={formatRupeesFromPaise(payment.requestedAmountPaise)} />
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Payment ID</p>
            <p className="mt-1 break-all font-mono text-sm font-semibold text-slate-800">{payment.id}</p>
          </div>
        </div>

        <Link to="/" className="button-secondary mt-7">
          <ArrowLeft className="h-4 w-4" />
          Create another payment
        </Link>
      </div>
    </PageShell>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1 text-base font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function CenteredState({ icon, title, description, action }: { icon: React.ReactNode; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="py-12 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">{icon}</div>
      <h2 className="mt-5 text-2xl font-bold tracking-tight text-slate-950">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
