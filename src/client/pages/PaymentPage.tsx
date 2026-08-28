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
  ShareNetwork,
  WarningCircle,
  XCircle,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { QRCodeCanvas } from 'qrcode.react';

import type { PublicPayment } from '../../shared/payment.js';
import { PageShell } from '../components/PageShell';
import { useCountdown } from '../hooks/useCountdown.js';
import { usePaymentStatus } from '../hooks/usePaymentStatus.js';
import { formatCountdown, formatRupeesFromPaise, verificationAdjustmentPaise } from '../lib/money.js';
import { getUpiId, toPersonalUpiUri } from '../lib/upi.js';

export function PaymentPage() {
  const { id = '' } = useParams();
  const { payment, loading, refreshing, error, refresh } = usePaymentStatus(id);

  if (loading && !payment) {
    return <PageShell><CenteredState icon={<CircleNotch className="h-8 w-8 animate-spin" />} title="Loading payment" description="Checking the latest status…" /></PageShell>;
  }

  if (!payment) {
    return (
      <PageShell>
        <CenteredState icon={<WarningCircle className="h-9 w-9" />} title="Payment unavailable" description={error ?? 'This payment could not be found.'} action={<Link to="/" className="button-secondary">Create a new payment</Link>} />
      </PageShell>
    );
  }

  return payment.status === 'pending'
    ? <PendingPayment payment={payment} refreshing={refreshing} error={error} onRefresh={refresh} />
    : <ResolvedPayment payment={payment} />;
}
function PendingPayment({ payment, refreshing, error, onRefresh }: {
  payment: PublicPayment;
  refreshing: boolean;
  error?: string;
  onRefresh: () => Promise<void>;
}) {
  const secondsLeft = useCountdown(payment.expiresAt);
  const locallyExpired = secondsLeft <= 0;
  const qrCanvasContainer = useRef<HTMLDivElement>(null);
  const qrShareFile = useRef<File | null>(null);
  const [copied, setCopied] = useState<'amount' | 'upi' | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(() => readPaymentAttempted(payment.id));
  const [handoffError, setHandoffError] = useState<string>();

  const personalUpiUri = payment.upiUri ? toPersonalUpiUri(payment.upiUri) : null;
  const upiId = payment.upiUri ? getUpiId(payment.upiUri) : null;
  const accountLabel = payment.paymentAccountLabel ?? accountFallback(payment);
  const flow = payment.paymentFlow ?? (payment.paymentAccount === 'paytm' ? 'qr_only' : 'upi_intent');
  const verification = payment.verificationMethod ?? verificationFallback(payment);
  const qrOnly = flow === 'qr_only' || flow === 'merchant_qr';
  const adjustment = verificationAdjustmentPaise(payment.requestedAmountPaise, payment.payableAmountPaise);

  useEffect(() => {
    if (!personalUpiUri) return;
    const frame = window.requestAnimationFrame(() => {
      const canvas = qrCanvasContainer.current?.querySelector('canvas');
      setQrImageUrl(canvas?.toDataURL('image/png') ?? null);
      canvas?.toBlob((blob) => {
        qrShareFile.current = blob ? new File([blob], `paygate-${payment.id.slice(0, 8)}.png`, { type: 'image/png' }) : null;
      }, 'image/png');
    });
    return () => window.cancelAnimationFrame(frame);
  }, [personalUpiUri, payment.id]);

  const rememberAttempt = () => {
    setAttempted(true);
    writePaymentAttempted(payment.id);
  };

  const copyText = async (kind: 'amount' | 'upi', value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied((current) => current === kind ? null : current), 1400);
    } catch {
      // The value remains visible for manual entry.
    }
  };

  const downloadQr = () => {
    if (!qrImageUrl) return false;
    const link = document.createElement('a');
    link.href = qrImageUrl;
    link.download = `paygate-${payment.payableAmount}-${payment.id.slice(0, 8)}.png`;
    link.click();
    rememberAttempt();
    return true;
  };

  const openUpi = () => {
    if (!personalUpiUri || locallyExpired) return;
    setHandoffError(undefined);
    rememberAttempt();
    window.location.href = personalUpiUri;
  };

  const shareQr = async () => {
    const file = qrShareFile.current;
    if (!file || typeof navigator.share !== 'function' || !navigator.canShare?.({ files: [file] })) {
      setHandoffError('Sharing is not supported here. Save the QR instead.');
      return;
    }
    try {
      await navigator.share({ files: [file], title: `Pay ₹${payment.payableAmount}` });
      rememberAttempt();
    } catch (shareError) {
      if (!(shareError instanceof DOMException && shareError.name === 'AbortError')) {
        setHandoffError('Could not open the share sheet. Save the QR instead.');
      }
    }
  };

  return (
    <PageShell>
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="paygate-kicker">{accountLabel} payment</p>
            <h1 className="mt-3 text-2xl font-black tracking-[-0.045em] text-[#11110f]">
              {locallyExpired ? 'Payment window ended' : attempted ? 'Waiting for verification' : 'Pay exactly'}
            </h1>
          </div>
          <div className={`paygate-chip pointer-events-none ${locallyExpired ? 'bg-amber-100/60 text-amber-950/70' : 'bg-white/65'}`} aria-live="polite">
            {refreshing ? <CircleNotch className="h-3.5 w-3.5 animate-spin" /> : <span className={`h-1.5 w-1.5 rounded-full ${locallyExpired ? 'bg-amber-500' : 'bg-emerald-500'}`} />}
            {locallyExpired ? 'Final check' : formatCountdown(secondsLeft)}
          </div>
        </div>

        {locallyExpired ? (
          <div className="mt-7 rounded-[1.5rem] border border-amber-900/10 bg-amber-100/55 p-5">
            <Hourglass className="h-8 w-8 text-amber-900/65" />
            <p className="mt-4 text-lg font-black tracking-[-0.03em] text-amber-950">Do not send this payment now.</p>
            <p className="mt-2 text-sm leading-6 text-amber-950/65">The QR and UPI actions are disabled. PayGate is still checking the authoritative final status in case the credit happened before expiry.</p>
          </div>
        ) : (
          <>
            <div className="mt-8 flex items-end justify-between gap-4 border-b border-black/10 pb-5">
              <div>
                <p className="paygate-kicker">Exact amount</p>
                <p className="paygate-number mt-2 text-[3.8rem] font-black leading-none tracking-[-0.07em] text-[#11110f] sm:text-[5rem]">{formatRupeesFromPaise(payment.payableAmountPaise)}</p>
              </div>
              <button onClick={() => void copyText('amount', payment.payableAmount)} className="button-icon mb-1" aria-label="Copy exact amount">
                {copied === 'amount' ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
              </button>
            </div>

            {attempted && (
              <div role="status" className="mt-5 flex gap-3 rounded-[1.4rem] border border-emerald-900/10 bg-emerald-100/45 p-4">
                <CircleNotch className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-emerald-800/70" />
                <div>
                  <p className="text-sm font-bold text-emerald-950/85">Checking for the matching credit</p>
                  <p className="mt-1 text-xs leading-5 text-emerald-950/55">No confirmation tap is needed. This page updates only after {verificationLabel(verification)} verifies the payment.</p>
                </div>
              </div>
            )}

            {personalUpiUri ? (
              <>
                <div ref={qrCanvasContainer} className="sr-only" aria-hidden="true">
                  <QRCodeCanvas value={personalUpiUri} level="M" size={768} bgColor="#ffffff" fgColor="#11110f" />
                </div>

                <div className="mx-auto mt-6 w-full max-w-[310px] rounded-[1.8rem] border border-black/8 bg-white p-4 shadow-[0_20px_45px_-30px_rgba(17,17,15,.42)]">
                  {qrImageUrl ? (
                    <img src={qrImageUrl} alt={`UPI QR for ₹${payment.payableAmount}`} className="aspect-square h-auto w-full select-none" />
                  ) : (
                    <div className="flex aspect-square items-center justify-center"><CircleNotch className="h-7 w-7 animate-spin text-black/30" /></div>
                  )}
                </div>

                {qrOnly ? (
                  <button onClick={() => void downloadQr()} disabled={!qrImageUrl} className="button-primary mt-5 min-h-14">
                    <DownloadSimple className="h-5 w-5" /> Save QR to pay
                  </button>
                ) : (
                  <button onClick={openUpi} disabled={!personalUpiUri} className="button-primary mt-5 min-h-14">
                    <ArrowSquareOut className="h-5 w-5" /> Pay {formatRupeesFromPaise(payment.payableAmountPaise)} in UPI app
                  </button>
                )}

                <p className="mt-3 text-center text-xs leading-5 text-black/42">
                  {qrOnly ? 'Open your UPI app → Scan QR → Gallery, then choose the saved image.' : 'If the UPI app does not open, use the QR below or save it from More options.'}
                </p>
              </>
            ) : (
              <div className="mt-6 rounded-[1.4rem] border border-amber-900/10 bg-amber-100/55 p-4">
                <QrCode className="h-6 w-6 text-amber-900/60" />
                <p className="mt-3 text-sm font-bold text-amber-950/80">Payment handoff unavailable</p>
                <p className="mt-1 text-xs leading-5 text-amber-950/55">Status checking still works. Create a new payment if you need a fresh QR.</p>
              </div>
            )}

            <div className="mt-5 flex items-start gap-3 rounded-[1.25rem] bg-black/[0.035] px-4 py-3.5">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#b6df36]" />
              <p className="text-xs leading-5 text-black/55">
                Requested {formatRupeesFromPaise(payment.requestedAmountPaise)} + {formatRupeesFromPaise(adjustment)} verification marker. <strong className="font-bold text-black/75">Do not change the final amount.</strong>
              </p>
            </div>
          </>
        )}

        {error && (
          <div role="status" className="mt-4 flex items-center justify-between gap-3 rounded-[1.15rem] border border-amber-900/10 bg-amber-100/45 px-4 py-3 text-xs text-amber-950/65">
            <span>Reconnecting — the last confirmed status is still shown.</span>
            <button onClick={() => void onRefresh()} className="font-bold text-amber-950/75 underline underline-offset-2">Retry</button>
          </div>
        )}

        <details className="group mt-4 border-t border-black/8 pt-4 text-sm">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-bold text-black/48 transition hover:text-black/75">
            More options & details
            <span className="text-lg transition group-open:rotate-45">+</span>
          </summary>
          <div className="grid gap-2.5 pb-1 pt-3 sm:grid-cols-2">
            {qrImageUrl && <button onClick={() => void downloadQr()} className="button-secondary"><DownloadSimple className="h-4 w-4" /> Save QR</button>}
            {qrImageUrl && <button onClick={() => void shareQr()} className="button-secondary"><ShareNetwork className="h-4 w-4" /> Share QR</button>}
            {upiId && <button onClick={() => void copyText('upi', upiId)} className="button-secondary">{copied === 'upi' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copy UPI ID</button>}
            <button onClick={() => void onRefresh()} disabled={refreshing} className="button-secondary"><CircleNotch className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Check now</button>
          </div>
          {handoffError && <p role="status" className="mt-2 text-xs leading-5 text-amber-800">{handoffError}</p>}
          <dl className="mt-4 grid gap-3 border-t border-black/8 pt-4 text-xs sm:grid-cols-2">
            <Detail label="Receiver" value={accountLabel} />
            <Detail label="Payment ID" value={payment.id} mono />
          </dl>
        </details>
      </div>
    </PageShell>
  );
}

function ResolvedPayment({ payment }: { payment: PublicPayment }) {
  if (payment.status === 'pending') return null;

  const content = {
    paid: {
      icon: <CheckCircle weight="fill" className="h-10 w-10" />,
      kicker: 'Verified',
      title: 'Payment received.',
      description: 'The matching credit was verified successfully.',
      tone: 'bg-emerald-100/65 text-emerald-800',
    },
    late: {
      icon: <WarningCircle weight="fill" className="h-10 w-10" />,
      kicker: 'Received late',
      title: 'Money received. Review needed.',
      description: 'The credit arrived after this payment window ended. Keep the payment ID for operator review.',
      tone: 'bg-amber-100/70 text-amber-800',
    },
    expired: {
      icon: <Hourglass className="h-10 w-10" />,
      kicker: 'Expired',
      title: 'This payment window ended.',
      description: 'Do not reuse the old QR or exact amount. Start a new payment instead.',
      tone: 'bg-black/[0.055] text-black/60',
    },
    cancelled: {
      icon: <XCircle className="h-10 w-10" />,
      kicker: 'Closed',
      title: 'Payment cancelled.',
      description: 'This session is no longer active. Start a new payment if you still need to pay.',
      tone: 'bg-black/[0.055] text-black/60',
    },
  }[payment.status];

  return (
    <PageShell>
      <div className="py-2 text-center sm:py-5">
        <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${content.tone}`}>{content.icon}</div>
        <p className="paygate-kicker mt-6">{content.kicker}</p>
        <h1 className="mx-auto mt-3 max-w-[12ch] text-[2.45rem] font-black leading-[0.98] tracking-[-0.055em] sm:text-[3.2rem]">{content.title}</h1>
        <p className="paygate-copy mx-auto mt-4 max-w-[42ch]">{content.description}</p>

        <div className="mt-7 rounded-[1.5rem] border border-black/8 bg-white/55 p-5 text-left">
          <p className="paygate-kicker">{payment.status === 'paid' || payment.status === 'late' ? 'Amount received' : 'Payment amount'}</p>
          <p className="paygate-number mt-2 text-4xl font-black tracking-[-0.055em]">{formatRupeesFromPaise(payment.payableAmountPaise)}</p>
          <div className="mt-4 border-t border-black/8 pt-4"><Detail label="Payment ID" value={payment.id} mono /></div>
        </div>

        <Link to="/" className="button-primary mt-5 min-h-14"><ArrowLeft className="h-4 w-4" /> New payment</Link>
      </div>
    </PageShell>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-black/32">{label}</dt>
      <dd className={`mt-1 break-all text-sm font-bold text-black/65 ${mono ? 'font-mono text-[11px]' : ''}`}>{value}</dd>
    </div>
  );
}

function CenteredState({ icon, title, description, action }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="py-10 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-black/[0.05] text-black/55">{icon}</div>
      <h1 className="mt-5 text-2xl font-black tracking-[-0.04em]">{title}</h1>
      <p className="paygate-copy mx-auto mt-2 max-w-sm">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

function accountFallback(payment: PublicPayment): string {
  if (payment.paymentAccount === 'slice') return 'Slice';
  if (payment.paymentAccount === 'paytm') return 'Paytm';
  return 'Kotak';
}

function verificationFallback(payment: PublicPayment): NonNullable<PublicPayment['verificationMethod']> {
  if (payment.paymentAccount === 'slice') return 'email';
  if (payment.paymentAccount === 'paytm') return 'notification';
  return 'sms';
}

function verificationLabel(method: NonNullable<PublicPayment['verificationMethod']>): string {
  if (method === 'email') return 'the bank email';
  if (method === 'notification') return 'the Paytm notification';
  return 'the bank SMS';
}

function readPaymentAttempted(paymentId: string): boolean {
  try {
    return window.sessionStorage.getItem(`paygate:payment-sent:${paymentId}`) === 'true';
  } catch {
    return false;
  }
}

function writePaymentAttempted(paymentId: string): void {
  try {
    window.sessionStorage.setItem(`paygate:payment-sent:${paymentId}`, 'true');
  } catch {
    // This flag only tunes local UX; server evidence remains authoritative.
  }
}
