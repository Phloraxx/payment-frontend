const PERSONAL_UPI_PARAMS = ['pa', 'pn', 'am', 'cu'] as const;

export function toPersonalUpiUri(upiUri: string): string | null {
  try {
    const source = new URL(upiUri);
    if (source.protocol !== 'upi:' || source.hostname !== 'pay') return null;

    const params = new URLSearchParams();
    for (const key of PERSONAL_UPI_PARAMS) {
      const value = source.searchParams.get(key)?.trim();
      if (value) params.set(key, value);
    }

    if (!params.get('pa') || !params.get('am')) return null;
    if (!params.get('cu')) params.set('cu', 'INR');

    return `upi://pay?${params.toString()}`;
  } catch {
    return null;
  }
}

export function toAndroidUpiIntent(upiUri: string): string | null {
  const personalUri = toPersonalUpiUri(upiUri);
  if (!personalUri) return null;

  const query = personalUri.slice('upi://pay?'.length);
  return `intent://pay?${query}#Intent;scheme=upi;end`;
}

export function toGooglePayUri(upiUri: string): string | null {
  const personalUri = toPersonalUpiUri(upiUri);
  if (!personalUri) return null;
  return `gpay://upi/pay?${personalUri.slice('upi://pay?'.length)}`;
}

export function toAndroidGooglePayIntent(upiUri: string): string | null {
  const personalUri = toPersonalUpiUri(upiUri);
  if (!personalUri) return null;
  const query = personalUri.slice('upi://pay?'.length);
  return `intent://upi/pay?${query}#Intent;scheme=gpay;package=com.google.android.apps.nbu.paisa.user;end`;
}

export function getUpiId(upiUri: string): string | null {
  const personalUri = toPersonalUpiUri(upiUri);
  if (!personalUri) return null;

  try {
    return new URL(personalUri).searchParams.get('pa');
  } catch {
    return null;
  }
}

export function isAndroidUserAgent(userAgent: string): boolean {
  return /Android/i.test(userAgent);
}
