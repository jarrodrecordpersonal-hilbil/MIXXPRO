# MIXXPRO v0.2 · Quality report

Updated 2026-09-15. This is evidence for a runnable pilot, not a production security certification, live-provider acceptance or physical-TV approval.

## Latest independently executed CI checks

GitHub Actions run **35024203372** tested PR head `ce3fe3c1901e4dfcd974979ea8aa8ca9ba8179f1` via merge commit `a896426e1c7154c37fcd5c96e06716bd70582ea9`.

- **49 / 49 Node tests passed on both Node 22 and Node 24.** These exercise the HTTP service, SQLite, domain/security/signing rules and the new secret-safe launch diagnostics.
- **26 JavaScript modules passed syntax checks.** Customer-facing terminology checks passed.
- **10 / 10 native-browser acceptance checkpoints passed.** This run used real Chromium navigation, actual HTTP requests, native LocalStorage/IndexedDB and a real service worker. No fetch bridge or in-memory storage substitute was used.
- **No uncaught browser JavaScript errors were recorded.** Eight venue pages had no horizontal overflow at 390px width.
- The downloaded tracked-source ZIP matched its published SHA-256 checksum.

Evidence: [CI run](https://github.com/jarrodrecordpersonal-hilbil/MIXXPRO/actions/runs/35024203372) and [retained acceptance summary](evidence/native-browser-ce3fe3c.json). CI artifacts include Node logs, native browser screenshots and the exact tested source archive; hosted artifacts have a 14-day retention period.

## What the native browser test proved

1. Signup created a real server session and venue.
2. Weighted My Mix and an independent visual theme persisted through browser requests.
3. Six-digit TV pairing started actual MP4 decoding and stored a downloaded video Blob in native IndexedDB.
4. Cloud Pause and Play controlled the video element.
5. Downloaded media continued during browser-emulated network loss while telemetry accumulated in IndexedDB.
6. A persistent Chromium profile closed and restarted offline; its pairing credential, cached media and outbox survived, and video resumed through the service-worker shell.
7. Reconnection drained the outbox into server playback analytics. Human dwell remained unmeasured.
8. All eight venue pages fit a 390px viewport without horizontal overflow.
9. An expired persisted playback lease stopped video after offline reload.
10. The complete flow recorded no uncaught JavaScript errors.

The test starts its own loopback-only server and disposable database/profile. It uses explicitly labelled six-second sample media, not a live Bunny account or real venue audience. The test's expired-lease case deliberately changes a disposable fixture record; it does not demonstrate DRM or tamper resistance. The application's Content Security Policy was not weakened to run the test.

**A Linux Chromium profile restart is not a physical-TV power-cycle certification.** Device codecs, operating systems, storage eviction, extended outages and unattended startup still require qualification.

## Earlier local checks

The initial runnable pilot also recorded 18 browser workflow/layout checks, 12 player checks, a SQLite snapshot restore inspection and an independent QR-matrix comparison. These are historical results, not additional native-browser checks in the latest CI run.

The earlier authoring-browser harness mounted actual code and bridged requests through httpx because direct navigation was restricted. It substituted LocalStorage/IndexedDB. Those earlier results did not prove native restart durability; the separate native CI flow above closes that gap for the specific tested Chromium environment only.

## Automated coverage

- Single-world and weighted selections; requested rotation length; shuffle and topic restrictions.
- Ad-free/premium filtering; clean approval; confirmed display rights and expiry.
- Five-/ten-year qualifying executed-agreement eligibility; timezone-aware and overnight scheduling.
- Sessions, tenant isolation, membership roles, admin/brand scope, CSRF and Origin checks.
- Single-use pairing, subscription seats, revocation, remote acknowledgements and heartbeat accounting.
- Context-bound playback records, duplicate-event handling and duration bounds.
- Consent before scans, signed order notifications, cumulative refunds and append-only commission accounting.
- Authoritative subscription reconciliation with mocked Stripe responses, never a grant from a checkout success page.
- Bunny/R2 signing helpers, QR encoding, integer-money calculations and secret-safe configuration diagnostics.

## Still untested or incomplete

- Real Bunny/R2 credentials, live CDN CORS/signatures and real customer media.
- Actual Stripe checkout/portal, merchant attribution and financial reconciliation.
- TV/HDMI hardware, native TV apps, casting, kiosk recovery, physical power cycles and watchdogs.
- Storage pressure/eviction, different browsers, long outages and actual deployed HTTPS-device durability.
- Docker/Compose execution, DNS/TLS hosting, multi-node storage and independent security/load/accessibility audits.
- Automated money transfers, tax/KYC, fulfillment, contract execution, equipment protection/insurance and human dwell measurement.

## Reproduce

```sh
npm run check
npm test
npm run doctor
# Optional isolated native browser acceptance; requires Playwright/Chromium:
python -m pip install playwright==1.57.0
python -m playwright install chromium
python tests/native_browser.py
```

`native_browser.py` owns and cleans up its disposable local fixture. Do not repoint it at production or customer data. The older `ui_harness.py` and `player_harness.py` additionally require httpx and their documented isolated test-server settings.

The launch checker lists configuration requirements without printing secret values. Its OK status means configuration is present and structurally acceptable, not that a provider was contacted or production launch was approved. See [Launch check](LAUNCH-CHECK.md).
