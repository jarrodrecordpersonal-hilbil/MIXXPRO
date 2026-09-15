# MIXXPRO

Production platform for MIXXTANK venue television programming, commerce attribution, and brand analytics.

## Product principles

- Venue UX must be extremely simple: pick what to play, pick where, play.
- A **MIXX** stays inside one content world (Golf, Bourbon, Travel, Cigar, Food, Cocktails, Music, Outdoors) and automatically incorporates newly published eligible content.
- **My Mix** blends multiple worlds with simple LESS / NORMAL / MORE preferences.
- **Shuffle** refreshes the current rotation without requiring manual programming.
- Themes are independent of content selection.
- Venues control one TV, selected TVs, groups, or all TVs from the cloud dashboard.
- Playback is CDN-delivered with local caching/offline continuity and playback verification.
- QR attribution follows venue -> TV -> content -> campaign -> scan -> order -> revenue share.
- Commerce hooks include barrel picks, venue-exclusive labels, events, and venue referrals.
- Brand analytics include verified playback, screen-hours, dwell estimates, scans, conversion, and attributable revenue.
- Plans: Free (sponsored + QR revenue share), Paid (ad-free), Premium (clean/premium content + advanced capabilities).
- MIXXTANK-funded hardware and professional installation are available **only** under qualifying 5-year or 10-year agreements. Self-serve venues use their own compatible equipment.
- Do not use the product term “Sets” for TVs/hardware.

## Initial production architecture

This repository is being built as a TypeScript monorepo:

- `apps/web` — venue/admin/brand web application
- `apps/player` — TV/player web runtime and offline cache shell
- `packages/domain` — shared domain types, MIXX rules, attribution model
- `packages/db` — database schema and persistence layer
- `docs` — architecture, product requirements, event taxonomy and deployment notes

See `docs/PRODUCT.md` and `docs/ARCHITECTURE.md`.
