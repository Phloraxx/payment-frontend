# payment-frontend

A small proof-of-concept UPI checkout for PayGate.

## Architecture

- React + Vite browser UI.
- Hono + Node server in the same container.
- Deployed as one Dockerfile application in Dokploy.
- The browser never receives `PAYGATE_API_KEY`.
- The Hono server talks to PayGate through `PAYGATE_URL` over normal HTTPS.
- Payment status uses smart polling only: every 2 seconds while the tab is visible, immediate refresh when the tab becomes visible again, and polling stops at a terminal state.
- No database, WebSocket, SSE, webhook receiver, Appwrite, Redis or Cloudflare runtime.

PayGate remains the source of truth for payment state, DDM allocation, expiry and bank evidence.

## Local development

Copy `.env.example` to `.env` and set a real PayGate API key.

Run the API server and Vite in separate terminals:

```bash
npm run dev:server
npm run dev:client
```

Vite proxies `/api/*` to the Hono server on port 3000.

## Production

Required environment variables:

```env
PAYGATE_URL=https://pay.mulearnscet.in
PAYGATE_API_KEY=<strong PayGate API key>
PORT=3000
TRUST_PROXY_HEADERS=false
```

Optional rate-limit settings:

```env
PAYMENT_CREATE_LIMIT=5
PAYMENT_CREATE_WINDOW_SECONDS=300
PAYMENT_CREATE_GLOBAL_LIMIT=60
PAYMENT_CREATE_GLOBAL_WINDOW_SECONDS=60

PAYMENT_STATUS_LIMIT=180
PAYMENT_STATUS_WINDOW_SECONDS=60
PAYMENT_STATUS_GLOBAL_LIMIT=1800
PAYMENT_STATUS_GLOBAL_WINDOW_SECONDS=60
```

Keep `TRUST_PROXY_HEADERS=false` unless the application is reachable only through trusted proxy infrastructure. With proxy trust enabled, a valid `CF-Connecting-IP` takes priority so Cloudflare Tunnel traffic is rate-limited by the original visitor address. When that header is absent or invalid, the app falls back to the rightmost valid `X-Forwarded-For` address. The production Dokploy route is restricted to local/Docker-private tunnel traffic so arbitrary direct-origin requests cannot supply trusted proxy headers.

## Payment flow

1. Browser sends a whole-rupee amount and a UUID idempotency key to `POST /api/payments`.
2. Hono validates and rate-limits the request, then calls PayGate with the server-side API key.
3. PayGate returns the exact DDM amount and authoritative UPI URI.
4. The browser renders the QR and stores only the non-sensitive payment session data locally so a same-browser refresh can restore the QR.
5. The browser polls `GET /api/payments/:id` every 2 seconds while visible. Status proxying has separate generous per-IP and global limits so normal polling is unaffected while arbitrary callers cannot generate unbounded PayGate traffic.
6. PayGate public status intentionally exposes no RRN, payer UPI ID, payer name or raw SMS.

The local session cache contains only the payment ID, amounts, expiry and UPI URI; it is removed when the payment reaches a terminal state and expires automatically after 24 hours.

The browser also retains the current amount + idempotency UUID in per-tab `sessionStorage` for up to 15 minutes until creation succeeds. This means a retry after a lost HTTP response asks PayGate for the same payment instead of reserving a second DDM amount, without coupling separate tabs to one checkout attempt.

When the local `expiresAt` deadline passes, the UI immediately removes the QR and all payment actions even if PayGate is temporarily unreachable; background polling continues only to learn the authoritative terminal state. `GET /api/health` is local frontend liveness only and deliberately does not proxy an upstream health request.

## Checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm audit --audit-level=high

docker build -t payment-frontend .
```

## Razorpay Test Mode

The public portal can optionally expose a separate Razorpay Test Mode checkout while keeping direct UPI as the default. The browser talks only to this Hono server; the server uses `RAZORPAY_TEST_API_KEY` to reach an isolated PayGate test service and never exposes that key.

```text
RAZORPAY_TEST_ENABLED=true
RAZORPAY_TEST_URL=http://paygate-razorpay-test:3000
RAZORPAY_TEST_API_KEY=<separate internal key>
```

The Test Mode customer flow uses Razorpay Custom Checkout (`razorpay.js`), not the Standard Checkout modal. The IEEE portal renders the enabled bank list from Razorpay's Methods API, creates the payment with the selected bank, and leaves only the secure demo-bank authentication outside the portal. The external methods response is normalized, size-limited and cached for five minutes; the browser receives bank codes/names only.

Direct UPI remains the default rail. Razorpay Test Mode cannot reproduce the final Live Mode UPI Intent/QR experience, so this seamless test flow uses enabled netbanking methods rather than a deprecated UPI Collect simulation.

The approved public webhook URL is:

```text
https://pay.ieeesahrdaya.com/api/razorpay/test/webhook
```

`cloudflare/worker.ts` is a thin custom-domain proxy from `pay.ieeesahrdaya.com` to the maintained Oracle/Dokploy portal at `payment.mulearnscet.in`. It contains no Razorpay credentials or payment state.
