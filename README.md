# PayGate Test Frontend

This repository is the browser test/reference client for PayGate. It is **not** the payment router. The v4 PayGate flow intentionally knows nothing about Paytm, Kotak, SMS parsing, relay state, or collection-profile selection.

## PayGate v4 flow

```text
Browser
  │ amount + person/name + event ID
  ▼
nginx same-origin BFF
  │ inject dedicated merchant API key
  ▼
PayGate /v1/payments
  │ chooses active collection profile + reserves exact amount
  ▼
canonical upi_uri
  │
  └─ browser renders QR and polls GET /v1/payments/:id
```

The browser never receives a PayGate merchant API key. `PAYGATE_V4_API_KEY` is the preferred runtime-only container variable and is injected by nginx for requests under `/api/paygate/`. During the v3→v4 cutover, the container also accepts the existing server-only `PAYGATE_API_KEY` as a compatibility fallback. Do not prefix either secret with `VITE_`.

The direct PayGate create request contains only:

```json
{
  "amount": 100,
  "name": "Sourav P Bijoy",
  "external_id": "evt_hardware_security_2026",
  "metadata": {}
}
```

`Idempotency-Key` is generated client-side and reused only while the amount + name + event ID draft is unchanged. No collection-profile identifier is accepted or sent by this frontend.

## QR and lifecycle

PayGate returns the canonical `upi_uri`; the frontend renders that exact string as the QR. It does not reconstruct or sanitize it into a provider-specific variant.

The UI follows the server lifecycle:

- normal payment window through `expires_at`;
- visible final grace window through `grace_until`;
- after grace, the QR is no longer presented as payable while the server completes expiry/quarantine handling.

Paid responses can show the observed payer name/UPI ID and `paid_at` when PayGate actually has those fields.

## Runtime configuration

```text
PAYGATE_V4_API_URL=https://pay.mulearnscet.in
PAYGATE_V4_API_KEY=<dedicated merchant key>
```

The container refuses to start unless either `PAYGATE_V4_API_KEY` or the legacy server-only `PAYGATE_API_KEY` is present. `PAYGATE_V4_API_KEY` always takes precedence. `PAYGATE_V4_API_URL` similarly falls back to `PAYGATE_URL`, then to `https://pay.mulearnscet.in`. The official nginx image renders `nginx.conf.template` at startup, so the key remains server-side and is absent from browser assets.

`VITE_PAYGATE_CHECKOUT_URL` remains only for the isolated legacy Razorpay experiment pages and is not used by the PayGate v4 flow.

## Development

```bash
npm ci
npm run check
```

The browser v4 API uses same-origin `/api/paygate/v1/...`, so local Vite-only development needs either an equivalent dev proxy or a containerized nginx run to exercise real PayGate requests. Unit tests mock this boundary.

## Production image validation

The Docker image:

1. runs the full frontend check in Node 22;
2. serves static assets with nginx;
3. exposes `/api/health`;
4. proxies `/api/paygate/*` to the configured PayGate server while injecting the merchant key.

Razorpay Test/Live experiment pages remain isolated from the PayGate v4 direct-UPI contract. Razorpay Live must never be enabled or used automatically.
