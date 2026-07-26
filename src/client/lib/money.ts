export function formatRupeesFromPaise(paise: number): string {
  if (!Number.isSafeInteger(paise)) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

export function verificationAdjustmentPaise(requestedPaise: number, payablePaise: number): number {
  return Math.max(0, payablePaise - requestedPaise);
}

export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
