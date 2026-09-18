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

A profile can be applied to one TV, a TV group or the whole venue. Schedules reference a saved profile rather than duplicating all programming rules.

## Venue ad upload

Venue-facing workflow is intentionally minimal: **Upload Ad** or **Make One For Me**. Uploaded venue creative is validated/transcoded and enters only that venue's eligible promotion slots. Venues do not assemble blocks or choose exact insertion points.

## Playout contract

The server-side programmer owns ordering, pacing, transitions, ad pods, frequency caps, competitive separation, backfill, rights filtering and rolling manifests. Players cache and execute manifests; venues do not stitch video blocks.
