# Settings readiness

Settings separates everyday venue tools, reporting, and network administration. Existing role checks still determine which destinations appear. Plan & Installation is removed from navigation, incorporating the user-requested cleanup in PR #26; the legacy billing endpoints and stored records are unchanged.

| Destination | Purpose and current behavior |
| --- | --- |
| Schedule | Choose programming, day presets and hours in one form. A live summary explains the selected days, local times and overnight end. Existing rows can be edited in place. Billboard dates stay in My Billboard. Viewers cannot add, edit or remove schedules. |
| My Billboard | Create and save a store-message draft, explicitly publish it to TV groups, and show it beside eligible portrait video. Existing draft, publication, QR expiry and playback behavior is preserved. |
| Bourbon Games | List published events and preserve the existing host, judge, presentation and scoring controls. When no events are available, explain why and show a labeled interactive phone/TV/scoring preview. |
| Music setup | Request and review funding for a separate licensed room soundtrack. A saved or approved request does not connect playback, buy equipment, or charge a customer. Current video volume and mute remain on the TV page. |
| MIXDATA | Inspect actual screen activity, venue location and filtered playback exports. It does not measure physical foot traffic. |
| Brand reports | Show assigned campaign reporting to brand users and administrators. Empty accounts explain the assignment requirement and point venue users toward MIXDATA. |
| MIXXWAVE Admin | Manage network content, environments and campaigns. Missing provider credentials disable the corresponding import/archive action. |
| Connections | Administrator-only video diagnostics and music-request review. Diagnostic results distinguish configuration from a verified working connection. |

TV appearance is no longer a separate venue setup step. New venues use the existing default look. Existing saved themes, accents, schedules and playback profiles are preserved; administrators can still style curated environments. QR visibility and screen modes stay in the existing TV controls.

Schedule editing validates the same inputs and venue permissions as creation. Updates preserve each row’s ID, creation time, active state, and therefore its position in overlap priority. The editor preserves existing TV targeting and screen styling. There is no database migration.

## Bourbon Games preview and remaining production work

The empty-state preview uses a fictional two-sample matchup entirely in browser memory. It can switch between Phone view, TV view and Scoring, and illustrates a correct or incorrect winner prediction. It sends no write requests, creates no events or players, saves no picks, provides no join QR and sends no TV commands. Navigating away resets the example.

Production still needs an event setup and host-assignment workflow before an operator can create a real event through this portal. This change does not add event creation or enable demo mode. Existing published events continue to use the actual game controls. Consumer accounts and store-team participation keep their existing pilot gate.

## Verification

- Syntax/terminology check and 192 automated tests.
- Existing 48 native browser checkpoints covering playback, offline behavior, live event hosting/scoring, consumer accounts, store teams, billboards and MIXDATA.
- 14 production-mode Settings/music/connection browser checkpoints, including owner/admin/viewer navigation, first-use states, game discovery failure/recovery, a zero-write preview, persisted schedules and in-place edits, failed-save recovery, missing provider configuration and 390px layouts.
- Desktop and phone screenshots inspected for the Schedule empty state, editor and saved cards, the Games preview, and standalone activation pages. The Schedule editor keeps Save and Cancel visible on phones.

All browser acceptance uses disposable local databases and fictional fixture venues. No production events, customers, provider connections or payments are created by these checks. Deployment remains a separate manual Render step.
