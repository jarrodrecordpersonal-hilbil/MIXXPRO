# MIXDATA

**MIXDATA is the screen analytics product, not the playback or music app.** The product name uses one X, as requested by the owner.

- Open **MIXDATA** in the venue navigation. The existing `/screens` route remains compatible.
- The data page, browser title, navigation label and downloaded CSV filenames use MIXDATA.
- See what played, on which named TV, at which venue-provided location, when reports arrived, and how many seconds were reported.
- Network admins, venue members and brand accounts retain their existing scoped access. Branding does not expand permissions.
- Playback reports are not measured human views, audience dwell, TV power attestation or device-GPS proof.

The internal `/api/screen-activity` endpoints and database tables are intentionally unchanged by the name correction. Media delivery, Bunny diagnostics and music-provider setup remain separate features; renaming this dashboard does not activate any external provider.

See [Screen-activity technical reference](SCREEN-ACTIVITY.md) for fields, pagination, CSV boundaries, location snapshots, telemetry validation and scale limitations.
