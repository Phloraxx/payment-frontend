import {
  ArrowLeft,
  Check,
  CheckCircle,
  CircleNotch,
  Copy,
  DownloadSimple,
  ShareNetwork,
  Hourglass,
  QrCode,
  WarningCircle,
  XCircle,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { QRCodeCanvas } from 'qrcode.react';

import type { PublicPayment } from '../../shared/payment.js';
import { PageShell } from '../components/PageShell';
import { StatusBadge } from '../components/StatusBadge';
import { useCountdown } from '../hooks/useCountdown.js';
import { usePaymentStatus } from '../hooks/usePaymentStatus.js';
import { formatCountdown, formatRupeesFromPaise, verificationAdjustmentPaise } from '../lib/money.js';
import { getUpiId, toPersonalUpiUri } from '../lib/upi.js';

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
  const locallyExpired = secondsLeft <= 0;
  const qrCanvasContainer = useRef<HTMLDivElement>(null);
  const qrShareFile = useRef<File | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedUpiId, setCopiedUpiId] = useState(false);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [handoffMessage, setHandoffMessage] = useState<string | null>(null);
  const [screenshotMode, setScreenshotMode] = useState(false);
  const adjustment = verificationAdjustmentPaise(payment.requestedAmountPaise, payment.payableAmountPaise);
  const personalUpiUri = payment.upiUri ? toPersonalUpiUri(payment.upiUri) : null;
  const upiId = payment.upiUri ? getUpiId(payment.upiUri) : null;

  useEffect(() => {
    if (!personalUpiUri) return;
    const frame = window.requestAnimationFrame(() => {
      const canvas = qrCanvasContainer.current?.querySelector('canvas');
      setQrImageUrl(canvas?.toDataURL('image/png') ?? null);
      canvas?.toBlob((blob) => {
        qrShareFile.current = blob ? new File([blob], 'paygate-upi.png', { type: 'image/png' }) : null;
      }, 'image/png');
    });
    return () => window.cancelAnimationFrame(frame);
  }, [personalUpiUri]);

  const copyAmount = async () => {
    try {
      await navigator.clipboard.writeText(payment.payableAmount);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // The exact amount remains visible for manual entry.
    }
  };

  const copyUpiId = async () => {
    if (!upiId) return;
    try {
      await navigator.clipboard.writeText(upiId);
      setCopiedUpiId(true);
      window.setTimeout(() => setCopiedUpiId(false), 1500);
    } catch {
      // Keep the visible UPI ID available as a manual fallback.
    }
  };

  const shareQr = async () => {
    setHandoffMessage(null);
    try {
      const file = qrShareFile.current;
      if (!file || typeof navigator.share !== 'function' || !navigator.canShare?.({ files: [file] })) {
        setHandoffMessage('QR sharing is not supported here. Use Screenshot mode or Save QR.');
        return;
      }
      await navigator.share({ files: [file], title: `Pay ₹${payment.payableAmount}` });
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === 'AbortError') return;
      setHandoffMessage('Could not open the share sheet. Use Screenshot mode or Save QR.');
    }
  };

  const downloadQr = () => {
    if (!qrImageUrl) return;
    const link = document.createElement('a');
    link.href = qrImageUrl;
    link.download = `upi-payment-${payment.id}.png`;
    link.click();
  };

  const openScreenshotMode = () => {
    setScreenshotMode(true);
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  const closeScreenshotMode = () => {
    setScreenshotMode(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  };

  return (
    <PageShell>
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Payment session</p>
            <h2 className="mt-2 text-2xl font-bold tracking-[-0.035em] text-slate-950">
              {locallyExpired ? 'Payment window ended' : 'Pay exactly'}
            </h2>
          </div>
          {locallyExpired ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-800">
              <Hourglass className="h-4 w-4" />
              Awaiting final status
            </div>
          ) : (
            <StatusBadge status="pending" refreshing={refreshing} />
          )}
        </div>

        {locallyExpired ? (
          <div className="mt-7 rounded-3xl border border-orange-200 bg-orange-50 p-5 text-center">
            <Hourglass className="mx-auto h-9 w-9 text-orange-700" />
            <p className="mt-3 font-semibold text-orange-950">Do not send this payment now</p>
            <p className="mt-2 text-sm leading-relaxed text-orange-800">
              The payment window has ended, so the QR actions have been disabled. We are still checking PayGate for the authoritative final status.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-5 flex items-end justify-between gap-3" aria-live="polite">
              <p className="text-4xl font-bold tracking-[-0.05em] text-slate-950">{formatRupeesFromPaise(payment.payableAmountPaise)}</p>
              <button onClick={copyAmount} className="button-icon" aria-label="Copy exact amount" title="Copy exact amount">
                {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
              </button>
            </div>

            {personalUpiUri ? (
              <>
                <div ref={qrCanvasContainer} className="sr-only" aria-hidden="true">
                  <QRCodeCanvas value={personalUpiUri} level="M" size={768} bgColor="#ffffff" fgColor="#0f172a" />
                </div>

                <div className="mx-auto mt-7 flex aspect-square w-full max-w-[280px] items-center justify-center rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
                  {qrImageUrl ? (
                    <img src={qrImageUrl} alt={`UPI QR for ₹${payment.payableAmount}`} className="h-full w-full select-none" />
                  ) : (
                    <CircleNotch className="h-8 w-8 animate-spin text-slate-400" />
                  )}
                </div>

                <button onClick={() => void shareQr()} disabled={!qrImageUrl} className="button-primary mt-6 disabled:cursor-not-allowed disabled:opacity-60">
                  <ShareNetwork className="h-5 w-5" />
                  Share QR
                </button>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <button onClick={openScreenshotMode} disabled={!qrImageUrl} className="button-secondary disabled:cursor-not-allowed disabled:opacity-60">
                    Screenshot mode
                  </button>
                  <button onClick={downloadQr} disabled={!qrImageUrl} className="button-secondary disabled:cursor-not-allowed disabled:opacity-60">
                    <DownloadSimple className="h-4 w-4" />
                    Save QR
                  </button>
                </div>

                <p className="mt-3 text-center text-xs leading-relaxed text-slate-500">
                  Tip: long-press the QR image to try your browser's Share or Google Lens actions.
                </p>

                {handoffMessage && (
                  <div role="status" className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {handoffMessage}
                  </div>
                )}

                {upiId && (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">UPI ID</p>
                      <p className="mt-1 truncate font-mono text-sm font-semibold text-slate-800">{upiId}</p>
                    </div>
                    <button onClick={copyUpiId} className="button-icon shrink-0" aria-label="Copy UPI ID" title="Copy UPI ID">
                      {copiedUpiId ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="mt-7 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-center">
                <QrCode className="mx-auto h-8 w-8 text-amber-700" />
                <p className="mt-3 font-semibold text-amber-900">QR unavailable after this session was restored</p>
                <p className="mt-1 text-sm leading-relaxed text-amber-700">Status checking still works. Create a new payment if you need the QR again.</p>
              </div>
            )}

            <div className="mt-6 grid grid-cols-2 gap-3">
              <Detail label="Requested" value={formatRupeesFromPaise(payment.requestedAmountPaise)} />
              <Detail label="Verification" value={`+${formatRupeesFromPaise(adjustment)}`} />
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-600">
              The extra paise identifies this payment. <strong className="font-semibold text-slate-900">Do not change the amount</strong> in your UPI app.
            </div>
          </>
        )}

        <div className="mt-5 flex items-center justify-between border-t border-dashed border-slate-200 pt-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Time remaining</p>
            <p className="mt-1 font-mono text-xl font-semibold text-slate-900">{formatCountdown(secondsLeft)}</p>
          </div>
        </div>

        {locallyExpired && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Requested amount</p>
            <p className="mt-1 text-base font-semibold text-slate-900">{formatRupeesFromPaise(payment.requestedAmountPaise)}</p>
          </div>
        )}

        {error && (
          <div role="status" className="mt-4 flex items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span>Connection issue: {error}</span>
            <button onClick={() => void onRefresh()} className="shrink-0 font-semibold underline underline-offset-2">Retry</button>
          </div>
        )}

        <p className="mt-5 break-all text-center font-mono text-[11px] text-slate-400">Payment ID: {payment.id}</p>
      </div>

      {screenshotMode && qrImageUrl && (
        <div className="fixed inset-0 z-[100] flex min-h-dvh flex-col items-center justify-center bg-white px-6 py-8 text-center text-slate-950">
          <button onClick={closeScreenshotMode} className="absolute right-5 top-5 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold">Close</button>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-400">Screenshot this QR</p>
          <p className="mt-3 text-4xl font-bold tracking-[-0.05em]">{formatRupeesFromPaise(payment.payableAmountPaise)}</p>
          <div className="mt-6 w-full max-w-[340px] rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <img src={qrImageUrl} alt={`UPI QR for ₹${payment.payableAmount}`} className="h-auto w-full" />
          </div>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-slate-600">Take a screenshot, then open your UPI app → Scan QR → Gallery and choose the newest screenshot.</p>
          <p className="mt-3 font-mono text-xs text-slate-400">Exact amount: ₹{payment.payableAmount}</p>
        </div>
      )}
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
