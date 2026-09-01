function parseUpi(upiUri: string): URL | null {
  try {
    const url = new URL(upiUri);
    if (url.protocol !== 'upi:' || url.hostname !== 'pay') return null;
    if (!url.searchParams.get('pa')?.trim() || !url.searchParams.get('am')?.trim()) return null;
    return url;
  } catch {
    return null;
  }
}

export function getUpiId(upiUri: string): string | null {
  return parseUpi(upiUri)?.searchParams.get('pa')?.trim() || null;
}

export function getUpiPayeeName(upiUri: string): string | null {
  return parseUpi(upiUri)?.searchParams.get('pn')?.trim() || null;
}

export function isCanonicalUpiUri(upiUri: string): boolean {
  return parseUpi(upiUri) !== null;
}
