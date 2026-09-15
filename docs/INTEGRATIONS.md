# Integrations and financial boundaries

## Stripe subscriptions

Create two **USD, monthly, per-unit recurring** prices: paid ad-free and premium clean. Set `STRIPE_PRICE_PAID` and `STRIPE_PRICE_PREMIUM`. One quantity equals one TV seat. The dashboard reads real price amounts; unavailable plans stay disabled rather than inventing a price.

Configure Stripe's billing portal for subscription management. Send `customer.subscription.created`, `.updated` and `.deleted` to `POST /api/hooks/stripe`; set the endpoint signing secret. Checkout writes the venue ID to subscription metadata. The webhook verifies the raw body, rereads the authoritative subscription, checks the configured price, and updates seats and entitlements. A success redirect alone never activates a paid plan.

Checkout creation uses a persistent idempotency key and a frozen one-hour expiry. An existing active subscription uses the portal instead of silently creating a second subscription. Complete test-mode purchase, cancellation, quantity changes, retries, payment failures and delayed webhook tests before enabling live keys.

References: https://docs.stripe.com/webhooks and https://docs.stripe.com/billing/subscriptions/quantities . Live Stripe API calls were not tested in this build environment.

## QR to merchant

Set `COMMERCE_URL` to your approved merchant's HTTPS landing destination. After adult confirmation and attribution consent, a customer link contains `mixx_scan=<opaque UUID>`. The merchant must retain it through checkout and send it back with the order. Browser age confirmation is not identity verification; the merchant remains responsible for lawful sale, delivery eligibility and age verification.

`POST /api/hooks/order` expects this JSON snapshot:

```json
{
  "eventId": "merchant-event-unique-id",
  "orderId": "merchant-order-stable-id",
  "scanId": "scan-id-from-the-customer-session",
  "netMerchandiseCents": 10000,
  "refundedCents": 0,
  "currency": "USD",
  "status": "settled"
}
```

Use a new `eventId` for each settled/refunded snapshot. `netMerchandiseCents` is the immutable original eligible merchandise amount after discounts, excluding tax/shipping. `refundedCents` is cumulative eligible merchandise refunds, not only the latest refund. Original amount/scan identity cannot change; older refund snapshots are rejected. Orders not settled/refunded are not commission events.

Header `X-Mixx-Signature: t=<unix seconds>,v1=<hex signature>`, where signature is HMAC-SHA256 using `COMMERCE_WEBHOOK_SECRET` over `<unix seconds>.<exact raw JSON body>`. Clock tolerance is five minutes. Use a new timestamp/signature when retrying. The event ID deduplicates retries independently of timestamp.

`COMMISSION_BPS` defaults to **0** pending approved commercial terms. Example `1000` means 10%, not a proposed Mixtank price. The rate is snapshotted on the order. Refunds append negative adjustments; historical ledger rows remain immutable.

## Payouts and referrals

Admin **Record external payout** is accounting only. It validates balance and unique reference; it does not call a bank or Stripe Connect. Actual payouts need identity/tax onboarding, supported payment rails, reconciliation and applicable compliance review.

Venue referrals store the introducing venue and report referred-venue count. Automatic referral commission accrual is not implemented. Barrel picks and exclusive labels are promotion hooks, not product fulfillment or label approvals.
