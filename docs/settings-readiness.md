# Settings readiness

Settings separates everyday venue tools, reporting, and network administration. Existing role checks still determine which destinations appear. Plan & Installation is removed from navigation, incorporating the user-requested cleanup in PR #26; the legacy billing endpoints and stored records are unchanged.

| Destination | Purpose and current behavior |
| --- | --- |
| TV appearance | Save a venue default or apply colors and overlays to selected paired TVs. Applying is disabled until a TV is paired. Saved MIXXes, environments and active schedules can supply their own appearance. Viewers have read-only controls. |
| Schedule | Save recurring programming and appearance by day and time, using the venue timezone. Billboard publication dates are managed in My Billboard. Viewers cannot add or remove schedules. |
| My Billboard | Create and save a store-message draft, explicitly publish it to TV groups, and show it beside eligible portrait video. Existing draft, publication, QR expiry and playback behavior is preserved. |
| Bourbon Games | List published events and preserve the existing host, judge, presentation and scoring controls. When no events are available, explain why and show a labeled interactive phone/TV/scoring preview. |
| Music setup | Request and review funding for a separate licensed room soundtrack. A saved or approved request does not connect playback, buy equipment, or charge a customer. Current video volume and mute remain on the TV page. |
| MIXDATA | Inspect actual screen activity, venue location and filtered playback exports. It does not measure physical foot traffic. |
| Brand reports | Show assigned campaign reporting to brand users and administrators. Empty accounts explain the assignment requirement and point venue users toward MIXDATA. |
| MIXXWAVE Admin | Manage network content, environments and campaigns. Missing provider credentials disable the corresponding import/archive action. |
| Connections | Administrator-only video diagnostics and music-request review. Diagnostic results distinguish configuration from a verified working connection. |

## Bourbon Games preview and remaining production work

The empty-state preview uses a fictional two-sample matchup entirely in browser memory. It can switch between Phone view, TV view and Scoring, and illustrates a correct or incorrect winner prediction. It sends no write requests, creates no events or players, saves no picks, provides no join QR and sends no TV commands. Navigating away resets the example.

Production still needs an event setup and host-assignment workflow before an operator can create a real event through this portal. This change does not add event creation or enable demo mode. Existing published events continue to use the actual game controls. Consumer accounts and store-team participation keep their existing pilot gate.

## Verification

- Syntax/terminology check and 187 automated tests.
- Existing 48 native browser checkpoints covering playback, offline behavior, live event hosting/scoring, consumer accounts, store teams, billboards and MIXDATA.
- 13 production-mode Settings/music/connection browser checkpoints, including owner/admin/viewer navigation, first-use states, game discovery failure/recovery, a zero-write preview, persisted appearance/schedules, missing provider configuration and 390px layouts.
- Desktop and phone screenshots inspected for the Games preview and standalone activation pages.

All browser acceptance uses disposable local databases and fictional fixture venues. No production events, customers, provider connections or payments are created by these checks. Deployment remains a separate manual Render step.
