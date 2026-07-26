import { useEffect, useState } from 'react';

function remainingSeconds(expiresAt: string): number {
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry)) return 0;
  return Math.max(0, Math.ceil((expiry - Date.now()) / 1000));
}

export function useCountdown(expiresAt: string | undefined): number {
  const [seconds, setSeconds] = useState(() => (expiresAt ? remainingSeconds(expiresAt) : 0));

  useEffect(() => {
    if (!expiresAt) {
      setSeconds(0);
      return;
    }
    const update = () => setSeconds(remainingSeconds(expiresAt));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  return seconds;
}
