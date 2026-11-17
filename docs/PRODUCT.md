# Product rules

## Keep the venue experience simple

- Choose Golf, Bourbon, Travel, Cigar, Food, Cocktails, Music & culture, or Outdoors.
- Inside a world, optionally choose subcategories; no selection means all eligible subcategories.
- Choose **My Mix** to combine worlds with Less / Normal / More.
- Save a 90-minute, three-hour or six-hour rotation; API supports 30–360 minutes.
- Choose a visual theme independently.
- Select one TV, a group or all TVs; press Play. Returning operators can Keep Playing.
- Shuffle changes rotation, not content preferences.
- New eligible films enter refreshed queues without venue reprogramming.

The default UI is warm white, deep green, restrained accents, generous spacing and short bullet lists. No crowded broadcast-console controls. Empty states lead to a specific next action.

## Plans and equipment

- Free: eligible sponsor insertion and configured QR revenue sharing; default pilot allowance five TVs.
- Ad-free: no third-party sponsor assets in the playlist.
- Premium clean: ad-free; only content manually marked clean; premium-only assets become eligible.
- Paid plans are priced per TV using real configured Stripe prices. No invented rate or automatic charge.
- QR overlays and venue's own promotions are separate from third-party ads.
- Commission defaults to zero until approved commercial terms are configured; this is not a promised revenue rate.
- **MIXXTANK-funded hardware and professional installation require an active, approved, signed five- or ten-year agreement.** A request is not an approval. All others bring compatible equipment.
- Use “TVs” and “equipment”; never introduce a separate hardware product name.

## Measurement

Online status comes from recent heartbeats. Download totals come from cached media records. Playback seconds come from bounded progress reports. Scans count affirmative consented QR visits, not every page request. Orders require signed merchant webhooks; refunds append adjustments. No human dwell, viewership or insurance claims are inferred from telemetry.

## Commerce scope

Events, barrel picks, labels and referrals have working promotion/request hooks. Actual retail fulfillment, bottle-label approval, pick allocations, referral incentive payouts and licensed merchant responsibilities are not automated in this pilot.

## MIXXWAVE sponsor-funded venue policy (2026-11-16)

- Venue programming and the player are free to the venue. Advertisers and sponsors fund the network; there is no required venue subscription fee.
- The API exposes only the Free plan and rejects new venue subscription checkouts unless an operator explicitly enables `VENUE_PAID_PLANS_ENABLED=true`. This opt-in keeps dormant legacy paid-plan functionality available without deleting it.
- Existing subscriptions remain visible to their owners and their Stripe billing portal and authenticated webhook reconciliation stay functional; no subscriptions are automatically canceled or refunded by this change.
- Free player/remote/pairing, scheduling, sponsor insertion and MIXDATA remain in place. Free TV allowance is a separately configurable pilot limit, not a mandatory venue subscription price.
- Sponsored placements require independent commercial approvals and creative rights; reported playback is not human viewership. No assumptions about sponsor sales or signed venue agreements are made by this code change.
- This policy does not modify hardware purchasing, installation agreements, or the legally separated SWAY business.
