# Settings readiness

Settings separates everyday venue tools, reporting, and network administration. Existing role checks still determine which destinations appear. Plan & Installation is removed from navigation, incorporating the user-requested cleanup in PR #26; the legacy billing endpoints and stored records are unchanged.

| Destination | Purpose and current behavior |
| --- | --- |
| Schedule | Choose programming, day presets and hours in one form. A live summary explains the selected days, local times and overnight end. Existing rows can be edited in place. Billboard dates stay in My Billboard. Viewers cannot add, edit or remove schedules. |
| My Billboard | Choose a starting template, edit the message beside its TV preview, save the draft, then explicitly publish. Dates, TV group and optional QR link live in an expandable section; saved billboards remain available below. |
| Bourbon Games | List published events and preserve the existing host, judge, presentation and scoring controls. When no events are available, explain why and show a labeled interactive phone/TV/scoring preview. |
| Music setup | Request and review funding for a separate licensed room soundtrack. A saved or approved request does not connect playback, buy equipment, or charge a customer. Current video volume and mute remain on the TV page. |
| MIXDATA | Inspect actual screen activity, venue location and filtered playback exports. It does not measure physical foot traffic. |
| Brand reports | Show assigned campaign reporting to brand users and administrators. Empty accounts explain the assignment requirement and point venue users toward MIXDATA. |
| MIXXWAVE Admin | Manage network content, environments and campaigns. Missing provider credentials disable the corresponding import/archive action. |
| Connections | Administrator-only video diagnostics and music-request review. Diagnostic results distinguish configuration from a verified working connection. |

TV appearance is no longer a separate venue setup step. New venues use the existing default look. Existing saved themes, accents, schedules and playback profiles are preserved; administrators can still style curated environments. Playback settings are reachable from both MIXX and TV. Clean Screen visibly turns off QR and venue promotions. Applying a saved setup requires a paired TV; owners and managers can save a setup before pairing. Viewers see the saved settings without edit/apply controls being enabled.

Schedule editing validates the same inputs and venue permissions as creation. Updates preserve each row’s ID, creation time, active state, and therefore its position in overlap priority. The editor preserves existing TV targeting and screen styling. There is no database migration.

Billboard drafts remain separate from published versions. Editing does not change TV output until explicit publication. Unsaved changes require confirmation before navigation, venue switching, venue creation or sign-out; browser refresh uses the native leave-page warning. In-flight writes block navigation until the result is known. Existing revision conflict handling, QR expiration, playback modes and publication leases remain in place.

The venue dashboard includes a public-source version fingerprint and checks for a newer UI on focus and once per minute while visible. A new version offers **Reload app** or **Later**; it never reloads automatically. Reload waits for open editors to close and honors unsaved billboard warnings. This notice is not loaded in the TV player. Already-open tabs from older releases need one manual refresh to load the notice feature.

## Bourbon Games preview and remaining production work

The empty-state preview uses a fictional two-sample matchup entirely in browser memory. It can switch between Phone view, TV view and Scoring, and illustrates a correct or incorrect winner prediction. It sends no write requests, creates no events or players, saves no picks, provides no join QR and sends no TV commands. Navigating away resets the example.

Production still needs an event setup and host-assignment workflow before an operator can create a real event through this portal. This change does not add event creation or enable demo mode. Existing published events continue to use the actual game controls. Consumer accounts and store-team participation keep their existing pilot gate.

## Verification

- Syntax/terminology check and 195 automated tests.
- Existing 48 native browser checkpoints covering playback, offline behavior, live event hosting/scoring, consumer accounts, store teams, billboards and MIXDATA.
- 18 production-mode Settings/music/connection browser checkpoints, including owner/admin/viewer navigation, first-use states, game discovery failure/recovery, a zero-write preview, persisted schedules and in-place edits, failed-save recovery, missing provider configuration, unpaired TV settings, unsaved billboard navigation/reload protection, version notices and 390px layouts.
- Desktop and phone screenshots inspected for the Billboard editor, Schedule empty state/editor/saved cards, Games preview and standalone activation pages; desktop screenshots also cover playback settings and the update notice. The Schedule editor keeps Save and Cancel visible on phones.

All browser acceptance uses disposable local databases and fictional fixture venues. No production events, customers, provider connections or payments are created by these checks. Deployment remains a separate manual Render step.
