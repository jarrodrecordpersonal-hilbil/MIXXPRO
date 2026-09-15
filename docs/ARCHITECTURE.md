# MIXXPRO architecture

## Applications
- `apps/web`: Next.js venue dashboard, MIXX control, TV management, commerce, revenue, admin and brand surfaces.
- `apps/player`: TV runtime. Device credential auth, manifest sync, local cache, playback heartbeat, command polling/streaming, offline event queue.

## Shared packages
- `packages/domain`: stable domain model and MIXX selection rules.
- `packages/db`: PostgreSQL/Drizzle schema.

## Media
Origin object storage -> transcoding pipeline -> CDN HLS/DASH renditions. Player downloads the next manifest window and caches media segments locally. Signed media URLs are short lived. Content IDs, not CDN URLs, are persisted in programming records.

## TV pairing
1. Unclaimed player asks API for a short-lived claim code.
2. Authenticated venue operator enters code in web dashboard.
3. Server atomically binds player to venue + TV and issues rotatable device credential.
4. Player reports heartbeat/capabilities/cache state.
5. Venue commands are server persisted and acknowledged by player.

## Playback verification
Player emits start, progress, complete, skip, error and heartbeat events with monotonic sequence numbers. Server deduplicates by player + sequence. Offline events queue locally and sync on reconnect.

## Attribution
QR resolver creates a scan session from signed venue/TV/content/campaign context. Checkout/order integration attaches scan session where possible. Revenue ledger is append-only.

## Security
Tenant isolation at every venue-scoped query, RBAC for venue/admin/brand roles, hashed device credentials, signed QR payloads, idempotency keys for event ingestion and commerce writes, rate limiting, audit logs and no secrets in clients.
