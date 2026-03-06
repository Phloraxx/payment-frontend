# Payment Portal Architecture & Logic

This repository implements a simple ticketing/payment portal using a
**React/TypeScript** frontend hosted by Vite and a **Cloudflare Workers**
backend.  Real‑time status updates are delivered via **Appwrite Realtime**
subscriptions, with Appwrite acting as the primary database.

The high‑level flow is:

1. User opens `/register?ticketId=…` or generates a new ticket with an
   amount.
2. Frontend calls `/api/ticket` to create a document in Appwrite and
   receives both an internal document ID and a human‑readable ticket ID.
3. A UPI QR code is shown; the user scans and pays.
4. When the SMS forwarder detects the payment it POSTs to
   `/api/webhook`, which updates the Appwrite document to `paid`.
5. The frontend, which has subscribed to the document via Appwrite
   realtime, immediately transitions to the **paid** state and
   navigates to the ticket page.

## Components

### Frontend (`src/pages/RegisterEvent.tsx`)

- **State** tracks `status`, `amount`, `docId`, `ticketId`, `upiString`,
  and a countdown timer based on the server’s `createdAt`.
- **Ticket creation**: POST `/api/ticket` with `{ amount }`. Response
  provides `{ id, ticketId, amount, createdAt }`. The `id` is kept in
  `docId` and used for secure subscriptions.
- **UPI URI** is built locally from the human ticket ID and amount. The
  QR code doesn’t leak the amount in the URL query string.
- **Realtime subscription**: opens a WebSocket to
  `databases.<DB>.collections.<COL>.documents.<docId>`. When an event with
  `status: "paid"` arrives, the UI updates and the user is redirected.
- **Race handling**: due to Appwrite sometimes omitting the
  `subscriptions` field from events, the client patches the SDK to
  dispatch by channel. A fallback status fetch after subscribing ensures
  the ticket isn’t missed.
- **Expiration**: ticket is valid for 5 minutes (server time) then
  transitions to `expired` automatically.

### Backend (Cloudflare Workers)

#### 1. `POST /api/ticket`
- Generates a unique `ticketId` (e.g. `TICKET${Date.now()}`).
- Inserts a document into Appwrite using the server SDK:
  ```js
  await databases.createDocument(DB, COL, ID.random(), {
      ticketId, amount, status: 'pending', createdAt: new Date().toISOString()
  }, [Permission.read(Role.any())]);
  ```
- Returns the Appwrite `id` and `ticketId` to the client.

#### 2. `POST /api/webhook?secret=…`
- Validates secret query string.
- Extracts text from `sms`/`body`/`message` and uses regex
  `/([A-Z0-9]+).*₹(\d+)/` to pull ticketId and amount.
- Loads the corresponding Appwrite document and compares amounts.
- If matching and not already paid, updates `{ status: 'paid', senderName }`.
- Appwrite update triggers realtime events to all subscribed clients.

#### 3. `GET /api/status/:id`
- Retrieves the document by `ticketId` (not internal ID) for public
  status checks.  This endpoint is rate‑limited by Cloudflare and is used
  by the frontend as a backup.

### Appwrite Configuration

- **Database** `697522750025b8e28c32` with collection `payment`.
- Documents have fields: `ticketId`, `amount`, `status`, `senderName`,
  `paidAt`, `createdAt`, etc.
- Default read permission is `role:any` (public) to allow anonymous
  realtime subscriptions; adjust to `user:<id>` for per‑user privacy.
- Realtime channel pattern: `databases.<DB>.collections.<COL>.documents.<ID>`.

> ⚠️ The project/collection IDs are public identifiers—not secrets. The
> security relies on Appwrite’s ACLs and your server’s API key.

## Realtime Robustness

Appwrite’s JS SDK expects incoming event frames to include a
`subscriptions` array. When the backend sends frames without that field,
the SDK silently drops them, causing missed updates.  To guard against
that we patch the `Realtime` instance at startup:

```ts
(function patchRealtime() {
  const r: any = realtime;
  if (r?.handleResponseEvent) { ... }
})();
```

This fallback simply delivers events by channel name if the array is
missing.  It’s harmless and can be left in production.

## Deployment

- Frontend: any static host that can serve the built Vite output.
- Backend: `npx wrangler deploy` to push the Workers code.
- Appwrite: ensure CORS/origin settings allow the frontend domain and
  that realtime tokens are valid.

## Security Considerations

- Never embed Appwrite API keys in the frontend.
- Use `read("any")` only for non‑sensitive public tickets; otherwise
  scope ACLs by user.
- All communication is over TLS (`https`/`wss`).

## Usage Notes

- QR code encodes `upi://pay?pa=souravpbijoy-3@oksbi&am={amount}&tn={ticketId}&cu=INR`.
- The amount is parsed from the upi string on resume; user doesn’t need
  to re‑enter it.
- Countdown and expiration are driven by the server’s `createdAt` time
  (client clocks may differ).

Happy hacking!