# MIXXPRO v0.2 · Quality report

Validated in the authoring environment on 2026-09-15. This is evidence for a runnable pilot, not a production security certification or live-provider acceptance.

## Completed local checks

- **41 / 41 automated Node tests passed.** Real HTTP service and in-memory SQLite, plus deterministic domain/security/signing tests. No runtime dependencies installed.
- **24 JavaScript modules passed syntax checks.** Customer-facing UI terminology check passed.
- **18 / 18 browser workflow/layout checks passed.** Real dashboard scripts, actual HTTP API, persisted venue records; desktop and 390px-wide layouts. No uncaught page errors.
- **12 / 12 player checks passed.** Actual HTMLVideoElement decoding a downloaded six-second MP4; cloud commands, simulated HTTP loss/reconnect and expired-window protection. No uncaught player errors.
- **Database snapshot restore inspection passed.** `npm run backup` produced a consistent SQLite snapshot; `PRAGMA integrity_check` returned `ok` when opened separately.
- QR matrices were compared against an independent QR implementation for byte-mode, level-L versions 1–5 with the same mask. No matrix-cell differences were found. A deterministic matrix regression is in the Node suite.

## Automated coverage

- Single-world and weighted multi-world selection; exact requested queue duration; deterministic shuffle; topic restrictions.
- Ad-free/premium filtering; clean and public-venue rights checks; expired/draft media exclusion.
- Five-/ten-year signed-agreement eligibility; timezone and overnight schedules.
- Authentication, tenant isolation, read-only membership, admin/brand scopes, CSRF and Origin rejection.
- One-time pairing, actual heartbeat counters, TV-seat limits, command acknowledgement and credential revocation.
- Stable issued manifests, context-bound playback events, deduplication and duration bounds.
- Consent before scans, webhook signatures, idempotent order ingestion, cumulative refunds and append-only ledger enforcement.
- Subscription entitlements reconciled from a mocked authoritative Stripe response, never from the checkout success page.
- Bunny URL token and R2 presigning structure; QR encoding; integer-money commission arithmetic.

## Browser and player test method

The authoring browser cannot navigate to a served origin. Tests mount the actual application HTML, stylesheet and scripts in Playwright, then bridge fetch requests to the real running HTTP API through httpx. The venue harness substitutes LocalStorage. The player harness substitutes IndexedDB with test memory while exercising the real cache controller, actual MP4 bytes, actual browser video decoding, remote queue and telemetry ingestion.

The player continues downloaded Blob playback during simulated HTTP loss, queues unsent events, and reports progress after reconnect. Subscription-seat denial pauses playback without deleting the pairing credential; restoring access resumes that TV without re-pairing. Expired manifest windows pause playback. These tests **do not** prove durability across a real browser restart or hardware power loss.

The screenshot harness suppresses transient toast overlays only during image capture so the underlying UI can be inspected. Screenshots are rendered from the application, not generated design mockups.

## Not tested or not implemented

- Native IndexedDB durability, storage eviction, service-worker offline navigation and reboots on a real HTTPS TV device.
- Real Bunny/R2 credentials, live CDN CORS/signatures, actual Stripe checkout/portal or real merchant-to-order attribution.
- Physical smart-TV or HDMI hardware qualification, native TV apps, casting, kiosk recovery and watchdogs.
- Docker/Compose execution, public DNS/TLS deployment, multi-node storage, production load/security/accessibility audits.
- Automated money transfers, tax/KYC onboarding, fulfillment, insurance coverage, legal contract execution or human dwell measurement.

## Reproduce

Run `npm run check` and `npm test` with Node 22.16+.

Optional browser QA requires Python, Playwright, Chromium and httpx. Start an isolated test server with `DEMO_MODE=true`, `APP_ORIGIN=http://127.0.0.1:3000`, and a disposable `DB_PATH`. Set `TEST_ORIGIN` and `TEST_DB` to match, then run `python tests/ui_harness.py` and `python tests/player_harness.py`. The harnesses create test accounts and the player harness promotes only its own disposable test account in that test database. Never point them at production or customer data.

GitHub Actions configuration is included for Node 22 and 24. Remote CI results must be checked on the actual commit; the local results above are not a claim that remote CI has already run.
