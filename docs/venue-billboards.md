# Venue billboards

My Billboard is available in the venue portal's secondary navigation. Owners and managers can create and publish their venue's text promotions. Viewers can preview saved work. Existing authentication, venue membership and CSRF checks apply to every write.

## Create and publish

Start with a blank draft or one of three editable house templates: The store selection, Join the tasting, or Discover your MIXX. Enter a headline (70 characters), message (160 characters), optional HTTPS destination, target TV group or all venue TVs, and start/end times in the venue's named timezone. There is a pilot limit of 100 saved billboards per venue.

Save draft stores the work privately. Publish copies the saved draft into a separate published snapshot, backed by the existing promotions table. Editing a published draft does not change the TV until another explicit publication. Withdraw disables the promotion and keeps the draft. The editor shows the published version separately. Earlier venue promotions remain available to stop through the portal.

Publication requires the current revision and a future end time. An edit, publication or withdrawal from a stale tab fails with a conflict. After a conflict or uncertain network response, reload saved drafts to reconcile before writing again. Mutation and audit records commit together. No media is published automatically by migration.

Times must resolve to one instant in the venue timezone. Skipped or repeated daylight-saving hours are rejected with an instruction to choose another time. A removed TV group must be corrected before republishing. During overlapping windows, a matching group-specific billboard takes precedence over an all-venue billboard; within that scope the most recently published billboard wins.

## TV delivery

The player detects the actual dimensions of the existing editorial video. On a landscape TV, a portrait short sits beside the billboard; on a vertical TV, the short sits above it. Landscape films retain their full frame. A small blurred canvas samples the same video at up to four frames per second to fill the background, without creating another video decoder or audio source. Reduced-motion preferences freeze this background.

The billboard is suppressed during game presentation, paid campaign video, venue creative video, unavailable playback, Clean Screen, or a disabled venue-promotion preference. No Ads still permits the venue's own promotions. The TV's QR setting independently controls the optional code. Existing audio, pairing, manifests, cache and playback reporting remain in place.

Billboard state has a maximum 15-second lease and expires sooner at the promotion's end. Loss of network or a failed state request clears the billboard; stalled requests cannot preserve it beyond the lease. Ordinary authorized cached video may continue. Online TVs receive publication, withdrawal and preference changes through the existing state polling. Billboards are not persisted for offline replay.

The TV's QR uses a short, random application URL that redirects only while the published promotion is active and within its schedule. Republish rotates the code; withdrawal or expiry disables it. Destinations must be HTTPS without embedded credentials. Redirects are rate limited and do not record visits, people, sales, impressions or revenue.

## Release and recovery

Migration 012 adds venue_billboards and indexes; it preserves existing promotions and all customer rows. Back up the running database with the existing SQLite snapshot command before deployment. The release does not add another service, change the persistent database path, enable automatic deployment, or enable consumer game accounts in production.

Release through the existing Render service after both Node CI versions and native browser acceptance pass. Verify the deployed commit, process health, the new public web/player module and stylesheet responses, and the venue portal. Pairing and authenticated acceptance should use an explicitly disposable test venue. Do not publish sample promotions to real customer TVs as a smoke test.

For a bad billboard, withdraw it or apply Clean Screen. If the application must roll back to the previous release, retain the additive schema and database; older code does not use the new table. Before rolling back, withdraw new billboards so their backing promotions do not remain active. Do not delete the database or run a destructive downgrade. Restore a pre-release backup only through the existing incident procedure because it can discard later writes.

Automated tests cover migration preservation, ownership, roles, CSRF, revision conflicts, atomic publication, schedules, preference handling, real portrait media, one-video/audio preservation, group isolation, QR redirects, mobile layout and lease expiry. Physical TV hardware and camera scanning still require an on-site check. The fixture uses synthetic venues and generated demo media, unavailable in production.

This release does not include image uploads, sponsor enrollment, paid billboard delivery, payout execution, audience/location tracking or a second simultaneous short. Existing video telemetry is device playback evidence, not a billboard impression or a human audience count.
