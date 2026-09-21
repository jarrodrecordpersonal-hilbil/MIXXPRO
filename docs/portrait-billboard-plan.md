# Portrait shorts and the retailer billboard

Status: product direction and interactive concept, September 21, 2026. No live
player layout, ad editor, campaign enrollment, tracking integration or payout
behavior is changed by this document. Keep implementation separate from account
and store-team PR #34. Owner direction: only build what makes sense; defer excess.

## First useful scope

Use one uncropped portrait short beside one billboard on a landscape TV. Fill the
whole screen with a quiet background derived from the film or venue branding.
The short owns the audio. The billboard uses one strong message, an approved image
when available, and one QR action. Preserve captions and readable/scannable safe
areas. A portrait display needs its own composition; do not shrink a landscape
billboard into an unreadable side strip. Two coordinated shorts remain an optional
future A/B tasting format, with one audio source, not unrelated competing videos.

Retailers retain control of the billboard. They can use their own message or
explicitly make the space available to MIXXWAVE sponsors. No automatic opt-in from
playing a game, scanning a QR or creating a consumer account.

The next implementation should be a small **My Billboard** venue portal:

1. Create a draft from a headline, message and QR destination. Add approved image
   upload only when the existing storage/media path supports it; do not block the
   first text/template release on a new media platform.
2. Choose a small MIXXWAVE library of editable templates and ready-made house ads.
   Clearly label editable templates, house messages and paid sponsor creatives.
3. Preview beside a portrait short, select the venue's permitted TV group and
   dates, then explicitly publish. Publishing is separate from saving a draft.
4. Offer optional sponsor participation with clear advertiser controls and an
   agreed revenue share before activation. Until real campaign fulfillment and
   settlement exist, this is an interest/request workflow, not live earnings.

The interactive concept includes an editable ad preview, template selection,
local photo preview, QR destination validation and a TV-group placement preview.
It does not persist drafts, upload media, produce a working QR, schedule playback
or publish anything. Sample brands/content are illustrative.

## Integration boundaries

- Reuse venue users/roles, CSRF, approved media, promotions, TV groups, player
  transport, playback controls and the accounting ledger. Consumer game accounts
  do not gain venue or billboard-edit permissions.
- Check venue ownership and media eligibility on the server for every draft,
  assignment and publication; client-selected IDs are not authority.
- Existing Clean Screen, No Ads, QR-off, venue-promotion settings, blocked brands,
  campaign dates and rights expiry continue to apply. A billboard must not bypass
  an advertising preference by being placed beside editorial video.
- Sponsor unavailability falls back to an approved store promotion or neutral
  branding, subject to those same display preferences. Never fabricate fill or
  show expired sponsor creative offline.
- The current player has one playback item and records device-reported delivery.
  A simultaneous billboard requires its own placement identity and validated
  delivery accounting. Do not credit the short's playback as billboard delivery
  or silently count two billable impressions from one existing playback event.
- Keep future dual-short media scheduling, decoding, audio and analytics out of
  the first portal release.

## Revenue and audience

Proposed retailer earnings are the contract-defined, collected sponsor revenue
allocated to that venue's eligible delivered placements, multiplied by the agreed
retailer share. No percentage is selected yet. Define allocation across stores,
refunds, taxes, deductions, reconciliation and payout timing before enrollment.
Reuse idempotent ledger entries and adjustments, not a client-side earnings total.
Record sponsor requests/agreements separately from money actually earned or paid.

Report these as separate measures:

| Measure | Meaning | Limit |
| --- | --- | --- |
| Device-reported ad delivery | Eligible creative displayed by an authorized player | Not proof someone watched |
| QR engagement | Recorded interactions with a placement's QR | Not total visits or distinct humans |
| Account participation | Distinct participating accounts | Not proof of presence; accounts are not verified people |
| Foot-traffic estimate | A named, authorized measurement source and time window | Not automatically ad exposure |
| Retailer earnings | Reconciled revenue and the agreed share | Not guaranteed or earned from unsold slots |

Google Popular Times describes relative busyness using aggregated, anonymized
data. Google Ads store visits are modeled conversions associated with eligible
Google ad campaigns. Neither establishes exact MIXXWAVE viewership or a general
phone census available to this product. No Google feed or API access is assumed.
References checked September 21, 2026:

- [Google Business Profile visit-data guidance](https://support.google.com/business/answer/6263531?hl=en)
- [Google Ads store-visit measurement and eligibility](https://support.google.com/google-ads/answer/6100636?hl=en)

Defer phone-location tracking, passive device collection, purchased location
datasets and audience-triggered payout bonuses. If audience measurement later
proves valuable, evaluate consented or anonymous aggregate sources with documented
coverage, limits and duplicate handling. Keep it separate from verified delivery
and financial settlement.

## Before publishing the first implementation

Verify a retailer can create/save/reopen a draft, select a library item, preview,
schedule and withdraw only its own venue's placements. Check template escaping,
image/URL validation, expiry and schedule time zones. Confirm no sponsor enrollment
or money is created by previewing. On real browser playback, verify portrait and
landscape layouts, single-source audio, QR readability, offline expiry, ad-mode
exclusions and distinct delivery IDs. Keep merge and deployment as owner gates.
