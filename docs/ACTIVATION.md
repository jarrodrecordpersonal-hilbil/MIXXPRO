# MIXXPLAY activation update

## What changed

- Venue dashboard now links to `/music`: choose venue-funded or sponsor-funded music, request 1–20 zones, review status and cancel a setup request.
- Admin dashboard now links to `/setup`: run a read-only Bunny diagnostic and review pending music requests.
- Funding review requires the payer agreement/payment reference, authorized music-provider reference, review expiry and a named sponsor when applicable.
- A new additive SQLite migration preserves the existing venue/media/ledger schema.

## Bunny checks

`POST /api/admin/bunny-check` requires an admin session and CSRF. It checks the configured library with its library-specific key, inspects a finished video's signed MP4 HEAD response, checks its CORS header, and tests whether unsigned file access is rejected. It does not upload, publish or download an entire video. Redirects are not followed; provider errors, keys and signed URLs are never returned in the diagnostic report. Calls are limited to six per administrator per minute.

Missing settings are listed by name. Add them through the running host's secret manager or private `.env`, never in chat or the public repository: BUNNY_LIBRARY_ID, BUNNY_API_KEY, BUNNY_CDN_HOST, BUNNY_TOKEN_KEY. APP_ORIGIN must describe the actual app origin.

A successful server check means **ready to test a player**, not verified video decoding, offline downloads, content rights or physical-TV compatibility. This delivery has no access to the user's live Bunny account. Official references: https://bunny.net/docs/stream/authentication and https://bunny.net/docs/stream/mp4-downloads .

## Music boundaries

Music requests are paid by the venue or by a confirmed sponsor, never automatically committed to MIXXPLAY. Creating or approving a request **does not charge a card, transfer money, buy equipment, purchase a provider subscription, or enable audio streaming**. Approval means the operator recorded payer/provider evidence; a licensed provider integration and actual playback qualification remain separate work. Cancelling a request does not cancel any external provider subscription.

The existing TV plans and 5-/10-year hardware agreement rules are unchanged. Customer-owned equipment remains the self-serve path. No automatic OS patching, new fleet-management subscription or background human support has been activated.

## Validation

Local Node suite: 77 tests passed, including 28 additional Bunny diagnostic and music-workflow checks. 32 JavaScript modules passed syntax checks. The local Chromium navigation test is blocked by the authoring environment's managed browser policy; no bypass was attempted. The native GitHub Actions job now runs `tests/activation_browser.py` after the existing player/cache restart test. Verify that job's actual outcome before marking the new browser flow accepted.

No public hosting deployment, live Bunny authentication, music-provider purchase or actual payment execution is claimed by this update.
