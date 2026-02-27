## API Reference

### 1. Generate Ticket
Creates a new payment ticket.
- **Endpoint**: `POST /api/ticket`
- **Body**:
  ```json
  { "amount": 100 }
  ```
- **Response**:
  ```json
  {
    "id": "TICKET1769333...",
    "amount": 100,
    "status": "pending"
  }
  ```

### 2. Payment Webhook
Called by the SMS forwarder app when a payment is received.
- **Endpoint**: `POST /api/webhook?secret=YOUR_SECURE_SECRET`
- **Headers**: `Content-Type: application/json`
- **Body Requirement**:
  The JSON body must contain a field (`sms`, `body`, or `message`) that includes the **Ticket ID** and the **Payment Message**.
  
  **Format Regex**: `"{Name} [has] paid you ₹{Amount}"`

  **Example Payload**:
  ```json
  {
    "sms": "Confirmed payment for TICKET1769333...",
    "body": "Sourav P Bijoy has paid you ₹100"
  }
  ```
- **Logic**:
  1. Validates `ticketId` exists in payload.
  2. Parses `senderName` ("Sourav P Bijoy") and `amount` (100).
  3. Verifies `amount` matches the amount stored in Appwrite for that ticket.
  4. If matched, updates status to `paid` and saves `senderName`.

### 3. Check Status
Checks the status of a specific ticket.
- **Endpoint**: `GET /api/status/:id`
- **Example**: `/api/status/TICKET1769333...`
- **Response**:
  ```json
  {
    "ticketId": "TICKET1769333...",
    "status": "paid",
    "amount": 100,
    "senderName": "Sourav P Bijoy"
  }
  ```

## Deployment
To deploy to Cloudflare Workers:
```bash
npx wrangler deploy
```

The qr code shown should have the ticketid as &tn and amount as &am and upi id of souravpbijoy-3@oksbi