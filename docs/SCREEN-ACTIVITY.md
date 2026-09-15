# Screen activity — what played, how long, and where

Open **Screen activity** in the venue navigation, or `/screens` on the deployed MIXXPRO origin. This is the application's own database history. It does not depend on Bunny analytics or infer audience headcount from video delivery.

## Available reports

- Venue members see their own venue's screens, including historical records from disconnected devices. Read-only members cannot edit the venue location.
- Platform administrators can switch to **Whole network** and filter venue, screen, UTC dates, video title, content world, city and region.
- Assigned brand users see only events linked to their brand's campaigns. Street address and postal code are excluded from their report data.
- Summary cards show reported screen-hours, reporting screens, plays with nonzero progress, errors, skips and ended records. A start event by itself adds zero screen-hours.
- Each row shows video, issued world/campaign, venue, named screen, venue-provided location, first/last event, received time, seconds reported, programmed duration, playback outcome and cached/network source.
- **Export this page · CSV** exports the currently displayed page, explicitly not the entire database. Raw event export is separately available through the paginated authenticated API below.
- Geographic summary shows the top 25 recorded city/region/country groups. Unknown locations remain unknown.

## Location is venue-supplied, not surveillance

Under **My venue → Edit venue location**, staff enter city, state/region, country and optional address/postal code. Saving changes affects future issued manifests only. We do not request GPS, camera/microphone permission, facial identity, phone location, foot traffic, or Wi-Fi/device fingerprinting.

New manifests snapshot the venue name, TV name, location and campaign labels. Telemetry binds to those server-issued snapshots; the player cannot submit a different venue address in an event. A later rename or venue move does not rewrite the historical snapshot. This is not a guarantee that a device is physically at that address; an operator could move it without updating the venue.

Legacy events remain in the database and are included. Where historical snapshots did not exist, the interface clearly labels **current names / legacy record**, and does not invent a historical location. No retroactive audience or location estimates are generated.

## Duration and accuracy

The player emits immutable event IDs, per-playback sequence numbers, the issued queue slot and cache/network source. A duplicate event is not credited twice. New sequences are unique per TV/playback, and an existing playback ID cannot be reassigned to a different video or manifest. Accepted progress is capped to the issued slot's length; a clipped final video is not credited for its entire file duration.

Playback progress is still **device-reported**, not an independently attested advertisement impression. The browser can be hidden, the HDMI cable disconnected, or the panel switched off. A compromised player could fabricate events. No human dwell time, viewership, attention, count of guests, or screen-power proof is claimed.

Reports use `[from,to)` UTC event-time windows, with seconds assigned to the timestamp of each progress event. This is not sub-second allocation across a midnight boundary; a progress event spans at most 30 reported seconds. First/last report are observed event timestamps, not guaranteed exact video start/stop boundaries. Pauses/buffering must not be calculated as `last timestamp - first timestamp` to invent watch time. “Ended” is a player lifecycle report, not proof that every programmed second or every guest was observed.

Offline events remain on the player and appear after reconnect. Received timestamps and counts delayed by more than 60 seconds distinguish late arrivals. Before upload, the server cannot report data still on the disconnected device. The existing player outbox limit is 6,000 events and the server accepts replay up to seven days old; this is not an unlimited archival guarantee.

Cache/network source describes the media playback source. It is not a byte-accurate CDN invoice, not proof of one download per month, and not an audience counter.

## Owned event API

`GET /api/screen-activity` returns the summary, paginated playback rows and geography. `GET /api/screen-activity/options` returns permitted filter choices. All calls require the normal authenticated session and the same authorization as the UI. Venue-scoped calls use `X-Venue-Id`; network scope requires admin; brand scope requires an assigned brand user.

Common filters:

```
scope=venue|network|brand
from=<Unix milliseconds, inclusive>
to=<Unix milliseconds, exclusive>
venueId=<optional>
tvId=<optional>
contentId=<optional>
campaignId=<optional>
world=<optional>
q=<literal substring of issued video title>
city=<exact case-insensitive match>
region=<exact case-insensitive match>
limit=50               # 1–200 playback rows
 offset=0              # page offset; send asOf from first response
asOf=<first response's ingestion boundary>
```

For full raw history, request `/api/screen-activity/events` using the same authorized scope and filters. It returns `rows`, `asOf`, `from`, `to`, and `nextCursor`. Keep those time boundaries on subsequent calls, pass `cursor=<nextCursor>`, and repeat until `nextCursor` is null. Pages are ordered by occurrence time and event ID, with an ingestion cutoff so later uploads cannot reshuffle an ongoing export. Each request covers at most 31 days; iterate time windows for longer archives. Resume/export cursors have a one-day asOf limit; restart a very long export with a new snapshot rather than using an expired boundary.

No device credentials, session tokens, API keys, customer email addresses or customer identities are exposed in these reports. Brand exports omit street-level location.

QR visits and attributed orders already live in separate relational tables keyed by venue/TV/content/campaign/manifest. The existing QR is shared within an issued manifest for the same content/campaign: do not claim an exact individual playback-to-purchase join or identity match without implementing that additional attribution model. This screen-activity report does not multiply purchases across playback rows.

## Persistence, upgrade, and scale

`002_screen_activity.sql` is additive and versioned; it retains previous event rows and the append-only financial ledger. It adds venue locations, immutable-per-playback context, event source/sequence fields and query indices. Back up before any deployment migration and perform a restore check. This change does not delete historical data or activate an external data warehouse.

The pilot keeps raw records in your application database. No automatic retention deletion was added. Define production retention, rollups, encrypted off-host backups, disaster recovery and restricted export access before rollout. This query implementation is for the single-host pilot; full 8,000-player analytics requires database sizing/load tests and a scalable warehouse/rollup architecture. It is not proven at that volume by unit/browser tests.

## Verification

The new Node suite covers access isolation, location snapshots, legacy data, UTC boundaries, time caps, duplicates, immutable playback identity, cache/network sources, late reports, raw pagination, brand redaction and an idempotent v1-to-v2 schema upgrade. The native browser test additionally exercises the actual screen-activity page, location editing, a real player's located events, CSV export and mobile layout. See the PR's CI results for the tested commit; local tests are not live provider or physical-TV certification.
