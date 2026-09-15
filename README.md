# MIXXPRO · MIXXTANK for venues

**Choose your MIXX → choose your TVs → play.**

A runnable, database-backed pilot, not a static dashboard. This replaces the earlier unconnected Next.js/player scaffold with a dependency-free Node.js service, a browser venue app and an HTML5 TV player. It has been locally tested; it is **not a live deployed service or certified smart-TV app**.

## Run it

Use Node.js **22.16 or newer**. There is no dependency installation step.

```sh
cp .env.example .env
npm start
# Open http://localhost:3000
# Open http://localhost:3000/player/ in a second browser or HDMI-connected device.
```

Create a venue account. On the TV open `/player/`. Enter its six-digit code in **TVs & remote → Pair TV**. Use a common HTTPS hostname for actual separate devices; `localhost` on another TV points to that TV, not your computer.

For the explicitly labelled six-second sample film, set `DEMO_MODE=true` locally, create an admin with `npm run admin -- --email you@example.test --role admin`, sign in, and choose **MIXXTANK Admin → Load test films**. This mode is rejected in production. Demo metadata and video are samples, not real MIXXTANK programming.

## Implemented

- Real signup/login, hashed passwords, revocable sessions, CSRF and venue/brand/admin authorization.
- Multiple venues; single-world MIXX and weighted My Mix; subcategories; saved visual themes; shuffle.
- Pairing codes, per-device credentials, TV groups, selected/all-TV commands and acknowledgement.
- Recurring schedules with venue timezones and overnight support.
- HTML5 video, bounded media-Blob downloads, IndexedDB player state/event queues, shell service worker and expiring offline leases.
- Bunny Stream catalog import, rights/clean-content approval, signed MP4 delivery and R2 private upload signing.
- Real QR images, consented attribution, signed order hooks, integer-money commission/refund ledger and payout recording.
- Free/ad-free/premium entitlements, configurable per-TV Stripe checkout and billing portal adapters.
- Venue events, barrel-pick/exclusive-label promotion hooks, venue referral attribution.
- Scoped brand reports and admin operations. No invented revenue, online TVs, cached hours or audience dwell.
- Five- or ten-year installation request/approval workflow. No subsidy without a qualifying signed, approved, active agreement.

## What is not complete or live

- Hosting, real credentials, catalog upload and live end-to-end provider/merchant tests.
- Physical-TV qualification, native Samsung/LG/Apple/Android apps, casting, kiosk watchdogs and cross-device offline certification.
- Email verification/self-service recovery, MFA and a production security/load audit. Use invite-only onboarding until reviewed.
- Automated bank transfers, tax/KYC handling, legally executed agreements, insurance or installation fulfillment. Payout records do **not** move money.
- A full fulfillment/label-design platform: barrel picks and exclusives currently enter as managed promotion hooks.
- Human dwell/viewer measurement; a playback report does not prove a person watched a display.
- Multi-node storage: this pilot uses SQLite WAL on one persistent host. PostgreSQL/multi-node scaling remains separate engineering.

## Quality checks

```sh
npm run check
npm test
```

See [QA report](docs/QA.md) for exact outcomes and limitations. Browser harnesses under `tests/` use Playwright and httpx as optional developer tools; they are not runtime dependencies.

## Operations

```sh
npm run admin -- --email owner@example.test --name Owner --role admin
npm run admin -- --email brand@example.test --role brand --brand brand-identifier
npm run backup
```

Keep generated admin passwords private. Set `MIXX_ADMIN_PASSWORD` through your secret manager to choose a password; do not put it in public shell scripts or GitHub.

- [Deployment and launch checklist](docs/DEPLOYMENT.md)
- [Bunny Stream and R2 setup](docs/MEDIA_SETUP.md)
- [Architecture and security boundaries](docs/ARCHITECTURE.md)
- [Merchant and billing hooks](docs/INTEGRATIONS.md)
- [Product rules](docs/PRODUCT.md)

This repository being public does **not** make your media, database, passwords or provider keys public. Those stay outside Git.
