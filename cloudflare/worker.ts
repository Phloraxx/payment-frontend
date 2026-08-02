const ORIGIN = new URL('https://payment.mulearnscet.in');
const PUBLIC_ORIGIN = 'https://pay.ieeesahrdaya.com';

function upstreamUrl(request: Request): URL {
  const incoming = new URL(request.url);
  return new URL(`${incoming.pathname}${incoming.search}`, ORIGIN);
}

function upstreamHeaders(request: Request): Headers {
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('cf-ray');
  headers.delete('cf-visitor');
  headers.set('X-Forwarded-Host', new URL(request.url).host);
  headers.set('X-Forwarded-Proto', 'https');
  return headers;
}

function responseHeaders(upstream: Response, path: string): Headers {
  const headers = new Headers(upstream.headers);
  if (path === '/api' || path.startsWith('/api/')) {
    headers.set('Cache-Control', 'no-store');
    headers.set('CDN-Cache-Control', 'no-store');
  }
  const location = headers.get('Location');
  if (location?.startsWith(ORIGIN.origin)) {
    headers.set('Location', `${PUBLIC_ORIGIN}${location.slice(ORIGIN.origin.length)}`);
  }
  return headers;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const incoming = new URL(request.url);
    const upstream = await fetch(upstreamUrl(request), {
      method: request.method,
      headers: upstreamHeaders(request),
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual',
    });
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders(upstream, incoming.pathname),
    });
  },
} satisfies ExportedHandler;
