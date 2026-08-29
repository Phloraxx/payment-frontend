# PayGate Checkout

PayGate Checkout is a static React/Vite application for direct bank/UPI and Razorpay checkout flows.

## Architecture

```text
Browser
  ├─ Kotak / Slice / Paytm ──► PayGate /api/checkout/v2
  └─ Razorpay checkout ───────► Razorpay JS + PayGate /api/checkout/v2
```

There is no application server or BFF in this repository. The production image serves compiled assets with Nginx. Payment creation, throttling, rail readiness, signature verification, and provider state live in the Go PayGate API.

The browser never receives PayGate integration credentials or Razorpay Key Secrets. Razorpay Key IDs are public by design and are returned only when the corresponding rail is enabled.

## Development

```bash
npm ci
npm run dev
```

The client defaults to `https://pay.mulearnscet.in`. For a local or staging API, set:

```bash
VITE_PAYGATE_CHECKOUT_URL=https://staging-pay.example.com
```

## Public checkout contract

The client calls only the guarded browser endpoints:

```text
GET  /api/checkout/v2/payment-accounts
POST /api/checkout/v2/payments
GET  /api/checkout/v2/payments/:id

GET  /api/checkout/v2/razorpay/:mode/config
POST /api/checkout/v2/razorpay/:mode/orders
GET  /api/checkout/v2/razorpay/:mode/orders/:id
POST /api/checkout/v2/razorpay/:mode/orders/:id/verify
```

Payment and Razorpay order creation send the UUID request ID in `Idempotency-Key`. The Go API owns request validation and per-IP/global rate limiting.

Razorpay payment methods are discovered from the Custom Checkout SDK `ready` event. A successful browser response is sent to PayGate for server-side signature verification; signed Razorpay webhooks remain the asynchronous provider source of truth.

## Production

Build and validate with `npm run check` and then build the Docker image.
