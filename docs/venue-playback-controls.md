# Venue playback controls

The venue UI stays simple. These controls describe the next product layer and are intentionally separate from low-level player/cache controls.

## Playback modes

Each saved MIXX / playlist carries a playback mode:

- **Full MIXX** — editorial programming plus eligible MIXXWAVE/brand ads, venue promotions and optional QR.
- **No Ads** — continuous editorial programming; no third-party/brand advertising. QR remains independently configurable.
- **Clean Screen** — continuous editorial programming with no advertising, no venue promotions and no QR/promotional overlay.

## Independent switches

- `showQr`: venue may hide the QR entirely.
- `showVenuePromotions`: venue may suppress its own promotional insertions.

Clean Screen always resolves both switches to off at playout time even if stale clients submit them as on.

## Brand exclusions

Venue may maintain a set of blocked advertiser brand IDs. Default behavior excludes paid/sponsored advertising from those brands while leaving genuinely editorial programming eligible. A future advanced control may block all content associated with a brand.

## Saved MIXXes

Venues can save multiple named programming profiles, e.g. Main Bourbon, Dinner, Game Day, Late Night, Clean Ambience. Each profile stores:

- MIXX/world selections and weights
- playback mode
- QR preference
- venue-promotion preference
- blocked advertiser brands
- visual theme/accent when explicitly customized

A profile can be applied to one TV, a TV group or the whole venue. Current schedules store their own mix and theme overrides.

## Switching between environments and saved MIXXes

Explicitly applying a saved venue MIXX clears that TV's curated-environment assignment in the same transaction. An unsuccessful or unauthorized request leaves both selections unchanged. Group/all-TV controls make the same authorized request for each target TV; other TVs are unaffected.

| Action | Effective selection |
| --- | --- |
| Choose a published environment | The environment supplies programming and playback settings; the prior saved profile remains available as a fallback. |
| Apply a saved venue MIXX | The saved profile supplies programming and playback settings; the environment assignment is removed. |
| Clear or withdraw the environment | The saved profile resumes, or TV/venue defaults apply if none exists. |
| Run an active schedule | The schedule overrides the mix and theme; playback mode, QR, promotions, and brand exclusions remain those of the selected environment/profile. |

The player includes these settings and the environment version in its state-change detection, so changing only a playback setting refreshes its manifest on the next successful state poll. Clean Screen, an explicit QR-off preference, and items without a QR image all hide the QR box and clear its image source. The same behavior applies to persisted manifests during offline playback. A disconnected player receives new settings after reconnecting.

## Venue ad upload

Venue-facing workflow is intentionally minimal: **Upload Ad** or **Make One For Me**. Uploaded venue creative is validated/transcoded and enters only that venue's eligible promotion slots. Venues do not assemble blocks or choose exact insertion points.

## Playout contract

The server-side programmer owns ordering, pacing, transitions, ad pods, frequency caps, competitive separation, backfill, rights filtering and rolling manifests. Players cache and execute manifests; venues do not stitch video blocks.
