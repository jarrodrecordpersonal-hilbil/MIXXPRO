# Architecture · v0.2 pilot

## Why the runtime changed

The earlier branch contained unconnected Next.js pages, a PostgreSQL design schema and an in-memory player placeholder. None was a complete operational system. This version replaces those executable placeholders with a runnable Node HTTP service and real SQLite relational persistence. It does not claim to have completed the earlier PostgreSQL/Drizzle architecture.

No runtime dependencies must be installed: Node built-ins provide HTTP, crypto, file delivery and SQLite. Browser ES modules provide the venue dashboard and player. This choice made the implementation executable and testable in the build environment. It is a **single-host pilot**, not a horizontally scalable service.

## Components

- `apps/server`: authenticated JSON API, static delivery, QR generation, provider signing and webhook reconciliation.
- `apps/web/public`: real venue/admin/brand UI, no framework build step.
- `apps/player/public`: HTMLVideoElement, persistent player state and downloaded MP4 Blobs, event queue, service worker.
- `packages/domain/src/runtime.mjs`: validation, entitlement filtering, duration-weighted rotation, themes and scheduling.
- `packages/db/migrations`: SQLite schema, foreign keys, indices and append-only ledger triggers.
- `scripts`: validation, operator account provisioning and consistent backups.

## Trust boundaries

A session cookie identifies the operator. A membership check scopes every venue API query. Device tokens are hashed server-side and are not venue IDs. A one-time six-digit code expires in ten minutes and atomically claims a device. Only that device can read or acknowledge its command queue. Paid seats are enforced server-side; online status is never a static green label.

Mutations require JSON, an allowed Origin when supplied, and CSRF tokens for session-scoped operations. Signed provider hooks use the unparsed request body. Passwords use salted scrypt. Content and QR URLs do not contain provider API keys. Only authenticated administrators request R2 uploads or modify global content/campaigns. Brand accounts see their own brand IDs only.

## Media and rotations

R2 holds original objects in a private bucket. Bunny imports become drafts; public venue exhibition and local-cache rights must be acknowledged before publication. Bunny encoding and MP4 accessibility are verified on publish. Paid/premium filtering happens in the server, not merely in the UI.

Manifests contain signed exact-file MP4 URLs and expire within six hours, or earlier for asset/campaign rights. Unchanged manifests are reused, reducing repeated queue/QR issuance. A refreshed queue preserves the player's next position rather than repeatedly restarting its first clip. Every block window and explicit shuffle changes selection. New eligible content can enter future queues without changing venue settings.

The player caches actual video bytes, not a map of remote URLs. A per-file cap and bounded storage budget apply; browser quotas/eviction can still prevent durable offline operation. Leases fail closed. A service worker stores only the player shell, not authenticated API responses. Desktop sleep, browser termination and hardware faults are outside a browser player's guarantees.

## Analytics and commerce

Events carry issued manifest context and deduplicate by event ID. Playback duration is bounded against the issued asset. A compromised device can still fabricate reports: these are **device-reported playback seconds**, not audited human views or dwell.

A venue has a stable QR. Manifest QR codes additionally carry TV/content/campaign context. Consent creates a scan ID. An external licensed merchant retains `mixx_scan` and sends signed settled-order/refund snapshots. Commission is integer-money net merchandise minus cumulative refunds, using the rate snapshotted on the original order. The ledger cannot be edited/deleted through SQL triggers. An external payout can be recorded, but no funds are transferred by this code.

## Known operational limits

No native-TV app store packages, trusted display-power attestation, DRM or encrypted-at-rest browser media. No multi-instance DB, automated retention/aggregation pipeline or external queue. Backups and security patching are operator duties. Long-term raw event/manifest retention and database growth require monitoring and a documented production retention strategy before scaling. Do not put this SQLite file on a shared network filesystem.
