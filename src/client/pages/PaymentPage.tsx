import {
  ArrowLeft, Check, CheckCircle, CircleNotch, Copy, DownloadSimple, Hourglass, ShareNetwork, WarningCircle, XCircle,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { QRCodeCanvas } from 'qrcode.react';

import type { PublicPayment } from '../../shared/payment.js';
import { PageShell } from '../components/PageShell';
import { useCountdown } from '../hooks/useCountdown.js';
import { usePaymentStatus } from '../hooks/usePaymentStatus.js';
import { formatCountdown, formatRupeesFromPaise } from '../lib/money.js';
import { getUpiId, getUpiPayeeName, isCanonicalUpiUri } from '../lib/upi.js';

export function PaymentPage() {
  const { id = '' } = useParams();
  const { payment, loading, refreshing, error, refresh } = usePaymentStatus(id);
  if (loading && !payment) return <PageShell><CenteredState icon={<CircleNotch className="h-8 w-8 animate-spin" />} title="Loading payment" description="Checking the latest status…" /></PageShell>;
  if (!payment) return <PageShell><CenteredState icon={<WarningCircle className="h-9 w-9" />} title="Payment unavailable" description={error ?? 'This payment could not be found.'} action={<Link to="/" className="button-secondary">Create a new payment</Link>} /></PageShell>;
  return payment.status === 'pending'
    ? <PendingPayment payment={payment} refreshing={refreshing} error={error} onRefresh={refresh} />
    : <ResolvedPayment payment={payment} />;
}

function PendingPayment({ payment, refreshing, error, onRefresh }: { payment: PublicPayment; refreshing: boolean; error?: string; onRefresh: () => Promise<void>; }) {
  const activeSeconds = useCountdown(payment.expiresAt);
  const graceSeconds = useCountdown(payment.graceUntil);
  const inGrace = activeSeconds <= 0 && graceSeconds > 0;
  const locallyEnded = graceSeconds <= 0;
  const qrCanvasContainer = useRef<HTMLDivElement>(null);
  const qrShareFile = useRef<File | null>(null);
  const [copied, setCopied] = useState<'amount' | 'upi' | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(() => readPaymentAttempted(payment.id));
  const [handoffError, setHandoffError] = useState<string>();
  const upiUri = isCanonicalUpiUri(payment.upiUri) ? payment.upiUri : null;
  const upiId = getUpiId(payment.upiUri);
  const payee = getUpiPayeeName(payment.upiUri) || upiId || 'UPI';

  useEffect(() => {
    if (!upiUri) return;
    const frame = window.requestAnimationFrame(() => {
      const source = qrCanvasContainer.current?.querySelector('canvas');
      if (!source) return;

      // The visible card supplies visual padding, but Gallery scanners need the
      // quiet zone inside the PNG itself. Export a square, unstyled scanner
      // image with a generous pure-white border around the exact PayGate QR.
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = 1024;
      exportCanvas.height = 1024;
      const context = exportCanvas.getContext('2d');
      if (!context) return;
      context.imageSmoothingEnabled = false;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, 1024, 1024);
      context.drawImage(source, 128, 128, 768, 768);

      setQrImageUrl(exportCanvas.toDataURL('image/png'));
      exportCanvas.toBlob((blob) => {
        qrShareFile.current = blob ? new File([blob], `paygate-${payment.id.slice(0, 8)}.png`, { type: 'image/png' }) : null;
      }, 'image/png');
    });
    return () => window.cancelAnimationFrame(frame);
  }, [upiUri, payment.id]);

  const rememberAttempt = () => { setAttempted(true); writePaymentAttempted(payment.id); };
  const copyText = async (kind: 'amount' | 'upi', value: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(kind); window.setTimeout(() => setCopied((current) => current === kind ? null : current), 1400); } catch { /* optional browser capability */ }
  };
  const downloadQr = () => {
    if (!qrImageUrl) return;
    const link = document.createElement('a'); link.href = qrImageUrl; link.download = `paygate-${payment.payableAmount}-${payment.id.slice(0, 8)}.png`; link.click(); rememberAttempt();
  };
  const shareQr = async () => {
    const file = qrShareFile.current;
    if (!file || typeof navigator.share !== 'function' || !navigator.canShare?.({ files: [file] })) { setHandoffError('Sharing is not available here. Save the QR instead.'); return; }
    try { await navigator.share({ files: [file], title: `Pay ₹${payment.payableAmount}` }); rememberAttempt(); }
    catch (shareError) { if (!(shareError instanceof DOMException && shareError.name === 'AbortError')) setHandoffError('Could not open sharing. Save the QR instead.'); }
  };

  if (locallyEnded) {
    return <PageShell><div className="payment-ended"><div className="ended-icon"><Hourglass /></div><p className="paygate-kicker">Payment window ended</p><h1>Don’t pay this QR now.</h1><p>The active and grace windows are over. PayGate is doing a final status check before this amount can eventually return to the pool.</p><button onClick={() => void onRefresh()} disabled={refreshing} className="button-secondary">{refreshing ? <CircleNotch className="h-4 w-4 animate-spin" /> : null} Check status</button><Link to="/" className="button-primary">Start a new payment</Link></div></PageShell>;
  }

  return <PageShell><div className="payment-ready paygate-enter">
    <div className="payment-topline"><div><p className="paygate-kicker">{inGrace ? 'Final grace window' : 'Ready to pay'}</p><p className="payment-receiver">to {payee}</p></div><div className="payment-timer" aria-live="polite">{refreshing ? <CircleNotch className="h-3.5 w-3.5 animate-spin" /> : <span className="timer-dot" />}{inGrace ? `Extra ${formatCountdown(graceSeconds)}` : formatCountdown(activeSeconds)}</div></div>
    {inGrace && <div className="checkout-warning"><strong>Pay now if you are continuing this payment.</strong><p>The normal five-minute window ended, but PayGate still keeps this exact amount reserved during the grace period.</p></div>}

    <section className="exact-amount-card amount-reveal"><span>Pay exactly</span><div className="exact-amount-row"><strong className="paygate-number">{formatRupeesFromPaise(payment.payableAmountPaise)}</strong><button onClick={() => void copyText('amount', payment.payableAmount)} className="button-icon" aria-label="Copy exact amount">{copied === 'amount' ? <Check /> : <Copy />}</button></div><p>Do not round or change this amount.</p></section>

    {attempted && <div className="waiting-card"><CircleNotch className="h-5 w-5 animate-spin" /><div><strong>Waiting for payment</strong><p>This page polls PayGate automatically. You do not need to choose or know the receiving account.</p></div></div>}

    {upiUri ? <>
      <div ref={qrCanvasContainer} className="sr-only" aria-hidden="true"><QRCodeCanvas value={upiUri} level="Q" size={768} bgColor="#ffffff" fgColor="#000000" /></div>
      <div className="qr-stage qr-reveal">{qrImageUrl ? <img src={qrImageUrl} alt={`UPI QR for ₹${payment.payableAmount}`} /> : <CircleNotch className="h-7 w-7 animate-spin text-black/30" />}</div>
      <button onClick={downloadQr} disabled={!qrImageUrl} className="button-primary payment-primary"><DownloadSimple className="h-5 w-5" /> Save QR and pay</button>
      <p className="payment-help">Scan this QR with any UPI app. Saved QR images include a scanner-safe white quiet zone for Gallery / Upload QR.</p>
    </> : <div className="checkout-warning"><strong>Payment QR unavailable</strong><p>Do not pay until PayGate returns a valid UPI instruction.</p></div>}

    {error && <div role="status" className="status-reconnect"><span>Connection interrupted. Your last confirmed status is still safe.</span><button onClick={() => void onRefresh()}>Retry</button></div>}

    <details className="payment-details"><summary>Payment details <span>+</span></summary><div className="payment-details-body"><dl>
      <Detail label="Payment ID" value={payment.id} mono /><Detail label="Name" value={payment.name} />
      {payment.externalId && <Detail label="Event ID" value={payment.externalId} mono />}
      <Detail label="Requested" value={formatRupeesFromPaise(payment.requestedAmountPaise)} /><Detail label="PayGate adjustment" value={formatRupeesFromPaise(payment.adjustmentPaise)} />
    </dl><p>The adjustment is already included in the exact amount. PayGate uses the reserved amount and notification timing to identify the payment.</p>
      <div className="detail-actions">{qrImageUrl && <button onClick={downloadQr} className="button-secondary"><DownloadSimple /> Save QR</button>}{qrImageUrl && <button onClick={() => void shareQr()} className="button-secondary"><ShareNetwork /> Share QR</button>}{upiId && <button onClick={() => void copyText('upi', upiId)} className="button-secondary">{copied === 'upi' ? <Check /> : <Copy />} Copy UPI ID</button>}<button onClick={() => void onRefresh()} disabled={refreshing} className="button-secondary">Check status</button></div>{handoffError && <p className="detail-error">{handoffError}</p>}
    </div></details>
  </div></PageShell>;
}

function ResolvedPayment({ payment }: { payment: PublicPayment }) {
  if (payment.status === 'pending') return null;
  const content = {
    paid: { icon: <CheckCircle weight="fill" className="h-10 w-10" />, kicker: 'Confirmed', title: 'Payment received.', description: 'PayGate matched the incoming payment successfully.', tone: 'bg-emerald-100/65 text-emerald-800' },
    expired: { icon: <Hourglass className="h-10 w-10" />, kicker: 'Expired', title: 'This payment window ended.', description: 'Do not reuse the old QR or exact amount. Start a new payment instead.', tone: 'bg-black/[0.055] text-black/60' },
    cancelled: { icon: <XCircle className="h-10 w-10" />, kicker: 'Closed', title: 'Payment cancelled.', description: 'This payment is no longer active. Start a new payment if you still need to pay.', tone: 'bg-black/[0.055] text-black/60' },
  }[payment.status];
  return <PageShell><div className="py-2 text-center sm:py-5 resolved-reveal"><div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${content.tone}`}>{content.icon}</div><p className="paygate-kicker mt-6">{content.kicker}</p><h1 className="mx-auto mt-3 max-w-[12ch] text-[2.45rem] font-black leading-[0.98] tracking-[-0.055em] sm:text-[3.2rem]">{content.title}</h1><p className="paygate-copy mx-auto mt-4 max-w-[42ch]">{content.description}</p>
    <div className="mt-7 rounded-[1.5rem] border border-black/8 bg-white/55 p-5 text-left"><p className="paygate-kicker">{payment.status === 'paid' ? 'Amount received' : 'Payment amount'}</p><p className="paygate-number mt-2 text-4xl font-black tracking-[-0.055em]">{formatRupeesFromPaise(payment.payableAmountPaise)}</p><div className="mt-4 grid gap-3 border-t border-black/8 pt-4"><Detail label="Payment ID" value={payment.id} mono /><Detail label="Name" value={payment.name} />{payment.externalId && <Detail label="Event ID" value={payment.externalId} mono />}{payment.status === 'paid' && payment.paidAt && <Detail label="Paid at" value={new Date(payment.paidAt).toLocaleString()} />}{payment.status === 'paid' && payment.payerName && <Detail label="Payer" value={payment.payerName} />}{payment.status === 'paid' && payment.payerUpiId && <Detail label="Payer UPI" value={payment.payerUpiId} mono />}</div></div>
    <Link to="/" className="button-primary mt-5 min-h-14"><ArrowLeft className="h-4 w-4" /> New payment</Link></div></PageShell>;
}
function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div className="min-w-0"><dt className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-black/32">{label}</dt><dd className={`mt-1 break-all text-sm font-bold text-black/65 ${mono ? 'font-mono text-[11px]' : ''}`}>{value}</dd></div>; }
function CenteredState({ icon, title, description, action }: { icon: React.ReactNode; title: string; description: string; action?: React.ReactNode; }) { return <div className="py-10 text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-black/[0.05] text-black/55">{icon}</div><h1 className="mt-5 text-2xl font-black tracking-[-0.04em]">{title}</h1><p className="paygate-copy mx-auto mt-2 max-w-sm">{description}</p>{action && <div className="mt-6">{action}</div>}</div>; }
function readPaymentAttempted(paymentId: string): boolean { try { return window.sessionStorage.getItem(`paygate:payment-sent:${paymentId}`) === 'true'; } catch { return false; } }
function writePaymentAttempted(paymentId: string): void { try { window.sessionStorage.setItem(`paygate:payment-sent:${paymentId}`, 'true'); } catch { /* optional browser capability */ } }
