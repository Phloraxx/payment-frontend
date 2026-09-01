import { CircleNotch, CheckCircle, Clock, XCircle } from '@phosphor-icons/react';
import type { PaymentStatus } from '../../shared/payment.js';

export function StatusBadge({ status, refreshing = false }: { status: PaymentStatus; refreshing?: boolean }) {
  const variants: Record<PaymentStatus, { label: string; className: string; icon: React.ReactNode }> = {
    pending: {
      label: refreshing ? 'Checking payment' : 'Waiting for payment',
      className: 'bg-amber-50 text-amber-800 border-amber-200',
      icon: refreshing ? <CircleNotch className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />,
    },
    paid: {
      label: 'Payment verified',
      className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      icon: <CheckCircle weight="fill" className="h-4 w-4" />,
    },
    expired: {
      label: 'Payment expired',
      className: 'bg-slate-100 text-slate-700 border-slate-200',
      icon: <XCircle className="h-4 w-4" />,
    },
    cancelled: {
      label: 'Payment cancelled',
      className: 'bg-slate-100 text-slate-700 border-slate-200',
      icon: <XCircle className="h-4 w-4" />,
    },

  };
  const variant = variants[status];
  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${variant.className}`}>
      {variant.icon}
      {variant.label}
    </div>
  );
}
