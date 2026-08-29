# PayGate v2 Checkout — UI/UX Rewrite

## Product goal

The customer-facing site is a payment instrument, not a marketing site or operator dashboard. It should feel calm, fast and trustworthy while still carrying a distinctive visual identity. Every state should make one next action obvious and keep the exact payable amount and authoritative verification status unambiguous.

## Research direction

Awwwards references used for visual direction:
- Cash App Brand Guidelines / Product Section: expressive product identity, motion and bold type without conventional fintech-dashboard chrome.
- Velocity X: dark SaaS hero/timeline treatment and strong responsive hierarchy.
- Mattered Inbox: fully interactive responsive layout with minimal UI.
- Baguette Studio: motion-led bento composition.
- Luca Dini: dynamic grid/typographic hierarchy and responsive light/dark treatment.

Usability grounding:
- Baymard 2024: perceived checkout effort correlates strongly with the number of fields/options users must consider.
- Baymard guideline #576, updated July 2026: hide irrelevant/redundant checkout fields and options.
- Mobile checkout guidance: preserve context, put help next to the decision, and minimize typing/interactions.

The design should borrow *principles*, not visual copies. Awwwards-style motion is used around transitions/status, never in a way that delays or obscures payment completion.
## Visual concept: Quiet confidence

- Warm off-white or near-black canvas rather than default Tailwind slate-on-white SaaS cards.
- One unmistakable PayGate wordmark/product mark; IEEE/event identity is secondary context, not a giant split-screen brand panel.
- Oversized amount typography is the visual anchor.
- Rounded surfaces are fewer and larger; avoid nested card-inside-card layouts.
- Fine hairlines, subtle noise/gradient and restrained depth replace many bordered boxes.
- Motion communicates state change: create -> ready -> waiting -> verified. No decorative preloader before a payment action.
- Color is semantic: neutral base, green verified, amber attention/late, red destructive/error. Provider colors do not dominate.
- Respect `prefers-reduced-motion` and maintain full keyboard/screen-reader usability.

## Information architecture

### `/` — New payment
Primary content:
1. Product identity + compact availability indicator.
2. Amount input.
3. Primary `Continue` action.
4. A small receiver/rail line such as `Receiving via Kotak · change` only when a choice is relevant.

Do not show separate large method cards by default. Test/live developer rails belong in an explicit lab/developer route, not the production customer choice set.

When all direct rails are unavailable, replace the action area with a concise service state. Do not render selectable-looking disabled cards for every unavailable provider.
### `/pay/:id` — Active payment

The active screen has four visual zones only:
1. Status and countdown.
2. Exact amount, very large and copyable.
3. The best payment action for the server-declared flow.
4. One concise explanation of why the paise adjustment must not change.

For `upi_intent`, prefer a primary `Pay ₹…` UPI handoff when the device/browser supports it, with QR as the fallback. For `qr_only`, show the QR as the hero and one primary `Save QR` action for same-device payment. The current separate buttons for screenshot mode, share, save, copy UPI ID, mark-as-paid and refresh move into contextual overflow/progressive disclosure or disappear.

Do not ask `I've completed the payment` merely to change local UI state. Verification is automatic and authoritative. After a handoff/save action, the interface can enter `Waiting for verification` automatically while polling continues.

The payment ID is accessible from `Details`, not permanently competing with the amount.

### Resolved states

`paid`: full-bleed/simple success transition, amount, verified time and one `Done / New payment` action.

`late`: clearly state money was received but needs operator review. Do not make it visually resemble failure/decline.

`expired`: state that the payment window ended and instruct the user not to reuse the old QR/amount.

`cancelled`: neutral closed state.

Network refresh failures should preserve the last authoritative payment state and present a small reconnecting indicator instead of replacing the whole screen with an error.
## Responsive behavior

Mobile is the primary layout, not a shrunk desktop card. On compact screens use one continuous canvas and keep the primary action reachable without excessive scroll. On desktop, expand negative space and contextual brand/system information rather than widening the payment form itself.

The current desktop split (`BrandPanel` + card) is removed. A desktop payment can use an asymmetric editorial grid, but the transaction surface remains visually singular.

## Motion rules

- 150–280 ms for control/state transitions.
- Longer 400–650 ms transitions only for major verified/resolved state changes.
- Never animate the exact amount through misleading intermediate values.
- QR stays stable and sharp; no continuous transform/filter animation around it.
- Countdown updates without layout shift.
- Use View Transitions/Framer Motion only where progressive enhancement does not affect the transaction.

## Accessibility

- AA contrast minimum for all transaction text and controls.
- Minimum comfortable touch target around 44–48 CSS px.
- Visible focus states and logical tab order.
- `aria-live` only for meaningful status transitions, not every poll/countdown tick.
- All state conveyed by text/icon as well as color.
- Reduced-motion path must remain first-class.

## UX acceptance metrics

Track privacy-safe aggregate events: checkout opened, valid amount submitted, payment created, handoff/QR save, payment verified, expired, API error and time-to-verification. Do not put payer evidence, UPI references or payment secrets in analytics.

Primary targets: fewer visible controls on `/`, fewer controls on active payment, lower create-to-payment abandonment, no increase in wrong-amount/late payments, and no loss of server-authoritative status clarity.