import {
  ArrowLeft,
  ArrowSquareOut,
  Check,
  CheckCircle,
  CircleNotch,
  Copy,
  DownloadSimple,
  Hourglass,
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

  const rememberAttempt = () => { setAttempted(true); writePaymentAttempted(payment.id); };
  const copyText = async (kind: 'amount' | 'upi', value: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(kind); window.setTimeout(() => setCopied((current) => current === kind ? null : current), 1400); } catch { /* visible fallback */ }
  };
  const downloadQr = () => {
    if (!qrImageUrl) return false;
    const link = document.createElement('a'); link.href = qrImageUrl; link.download = `paygate-${payment.payableAmount}-${payment.id.slice(0, 8)}.png`; link.click(); rememberAttempt(); return true;
  };
  const openUpi = () => { if (!personalUpiUri || locallyExpired) return; setHandoffError(undefined); rememberAttempt(); window.location.href = personalUpiUri; };
  const shareQr = async () => {
    const file = qrShareFile.current;
    if (!file || typeof navigator.share !== 'function' || !navigator.canShare?.({ files: [file] })) { setHandoffError('Sharing is not available here. Save the QR instead.'); return; }
    try { await navigator.share({ files: [file], title: `Pay ₹${payment.payableAmount}` }); rememberAttempt(); }
    catch (shareError) { if (!(shareError instanceof DOMException && shareError.name === 'AbortError')) setHandoffError('Could not open sharing. Save the QR instead.'); }
  };

  if (locallyExpired) {
    return <PageShell><div className="payment-ended"><div className="ended-icon"><Hourglass /></div><p className="paygate-kicker">Payment expired</p><h1>Don’t pay this one.</h1><p>This payment window has ended. PayGate is doing one final status check in case money arrived before the deadline.</p><button onClick={() => void onRefresh()} disabled={refreshing} className="button-secondary">{refreshing ? <CircleNotch className="h-4 w-4 animate-spin" /> : null} Check status</button><Link to="/" className="button-primary">Start a new payment</Link></div></PageShell>;
  }

  return (
    <PageShell>
      <div className="payment-ready">
        <div className="payment-topline"><div><p className="paygate-kicker">Ready to pay</p><p className="payment-receiver">to {accountLabel}</p></div><div className="payment-timer" aria-live="polite">{refreshing ? <CircleNotch className="h-3.5 w-3.5 animate-spin" /> : <span className="timer-dot" />}{formatCountdown(secondsLeft)}</div></div>

        <section className="exact-amount-card">
          <span>Pay exactly</span>
          <div className="exact-amount-row"><strong className="paygate-number">{formatRupeesFromPaise(payment.payableAmountPaise)}</strong><button onClick={() => void copyText('amount', payment.payableAmount)} className="button-icon" aria-label="Copy exact amount">{copied === 'amount' ? <Check /> : <Copy />}</button></div>
          <p>Don’t round or change this amount.</p>
        </section>

        {attempted && <div className="waiting-card"><CircleNotch className="h-5 w-5 animate-spin" /><div><strong>Waiting for payment</strong><p>You can leave this page open. It updates automatically when the payment is confirmed.</p></div></div>}

        {personalUpiUri ? <>
          <div ref={qrCanvasContainer} className="sr-only" aria-hidden="true"><QRCodeCanvas value={personalUpiUri} level="M" size={768} bgColor="#ffffff" fgColor="#171814" /></div>
          {qrOnly ? <>
            <div className="qr-stage">{qrImageUrl ? <img src={qrImageUrl} alt={`UPI QR for ₹${payment.payableAmount}`} /> : <CircleNotch className="h-7 w-7 animate-spin text-black/30" />}</div>
            <button onClick={() => void downloadQr()} disabled={!qrImageUrl} className="button-primary payment-primary"><DownloadSimple className="h-5 w-5" /> Save QR and pay</button>
            <p className="payment-help">Save the QR, then choose it from your UPI app’s scanner.</p>
          </> : <>
            <button onClick={openUpi} className="button-primary payment-primary"><ArrowSquareOut className="h-5 w-5" /> Open UPI app</button>
            <div className="qr-fallback"><div><strong>Paying from another device?</strong><span>Scan this QR instead.</span></div>{qrImageUrl ? <img src={qrImageUrl} alt={`UPI QR for ₹${payment.payableAmount}`} /> : <CircleNotch className="h-5 w-5 animate-spin" />}</div>
          </>}
        </> : <div className="checkout-warning"><strong>Payment handoff unavailable</strong><p>Create a new payment to get a fresh UPI link or QR.</p></div>}

        {error && <div role="status" className="status-reconnect"><span>Connection interrupted. Your last confirmed status is still safe.</span><button onClick={() => void onRefresh()}>Retry</button></div>}

        <details className="payment-details"><summary>Payment details <span>+</span></summary><div className="payment-details-body">
          <dl><Detail label="Payment ID" value={payment.id} mono /><Detail label="Receiver" value={accountLabel} /><Detail label="Requested" value={formatRupeesFromPaise(payment.requestedAmountPaise)} /><Detail label="Verification marker" value={formatRupeesFromPaise(adjustment)} /></dl>
          <p>The small marker is how PayGate identifies this payment automatically. It is already included in the exact amount above.</p>
          <div className="detail-actions">{qrImageUrl && <button onClick={() => void downloadQr()} className="button-secondary"><DownloadSimple /> Save QR</button>}{qrImageUrl && <button onClick={() => void shareQr()} className="button-secondary"><ShareNetwork /> Share QR</button>}{upiId && <button onClick={() => void copyText('upi', upiId)} className="button-secondary">{copied === 'upi' ? <Check /> : <Copy />} Copy UPI ID</button>}<button onClick={() => void onRefresh()} disabled={refreshing} className="button-secondary">Check status</button></div>
          {handoffError && <p className="detail-error">{handoffError}</p>}
        </div></details>
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
