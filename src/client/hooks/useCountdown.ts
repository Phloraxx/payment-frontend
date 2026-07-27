import { useEffect, useState } from 'react';

function remainingSeconds(expiresAt: string): number {
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry)) return 0;
  return Math.max(0, Math.ceil((expiry - Date.now()) / 1000));
}

export function useCountdown(expiresAt: string | undefined): number {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setInterval(() => setTick((current) => current + 1), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  return expiresAt ? remainingSeconds(expiresAt) : 0;
}
