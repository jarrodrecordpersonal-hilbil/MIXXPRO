# MIXXWAVE stability audit — 2026-11-16

## Baseline and safety boundary

- Repository: MIXXPRO, main commit a0e2fd898fa66f9555244283b78223b481908edf.
- Render's mixxwave-pilot service was last observed at commit 04f48472a93e6d9db3a6e14e64ac6e1c763eb955, 12 commits behind main, with automatic deployment disabled. Verify state again immediately before any release.
- This change is confined to the development branch. No database migration, external configuration, production data, subscriptions, or deployment changes.
- All substantial changes require owner review before a release is scheduled.

## First addressed reliability issue: reconnection event backlog

The player persists playback events in IndexedDB while offline. Previously each flush attempted only the first 100 events, so a larger outbox needed many separate flush opportunities after reconnection. The new bounded drain processes at most three batches of 100 per pass, re-reads persisted events between batches and only deletes IDs explicitly acknowledged by the server as accepted or rejected for that batch. A failed or partial response preserves unconfirmed events for later retries. It deliberately does not alter the server event model or claim human viewership.

Focused tests cover 230 events, a bounded partial drain, unacknowledged IDs, network failure, inactive player, and empty acknowledgments. Full CI and physical-device acceptance are separate gates.

## Remaining audit priorities (not certified)

1. Verify deploy-to-commit traceability, off-host backup and restore, and tested rollback before touching the live Render service.
2. Test a real TV/browser device over a full service period, including power cycle, audio/autoplay consent, video decode, network loss, reconnection, and storage eviction. Browser CI is not physical-TV certification.
3. Review the 15-second device API timeout, repeated sync behavior, stale command handling and crash/restart recovery under unstable network conditions.
4. Inspect persistent IndexedDB queue limits and expired-lease behavior at high storage use; measure real media cache performance.
5. Verify live Bunny CDN signatures, content rights and CORS without placing keys in source or CI logs.
6. Verify multitenant authorization, audit/event retention, monitoring and alerting, payment/merchant integrations and production recovery responsibilities.
7. Decide TV hardware support and scaling targets before replacing the single-host SQLite pilot architecture.

## Release gates

- Complete Node 22/24 syntax and unit tests, existing Chromium acceptance, and targeted regression checks.
- Prove playback on actual supported equipment with an independent phone controlling the player.
- Confirm secrets, database backup and rollback in private operational systems.
- Review all code changes, test failures and deployment diff with the owner.
- Merge or deploy only after explicit approval. This branch is not a production release.
