# Bourbon Games demo control room

Entry point: `/games/host`, served **only with `DEMO_MODE=true`**. Production
configuration forbids demo mode. No production navigation, flag, deployment,
database migration, or real event creation is changed by this increment.

Sign in through the existing venue UI, then open the control-room URL in the
same browser. Choose a venue and event. A platform administrator may create the
fictional Proof Trials fixture. Creation reuses an existing fixture; it does not
reset a completed event. Use a disposable demo database for another rehearsal.

## Rehearsal workflow

1. Choose a TV group (or all TVs in your selected venue) and request presentation.
2. Guests open the linked participation page using the existing short code.
3. The assigned operator selects an unplayed matchup and a 5–3600 second
   prediction window, then opens predictions.
4. The operator locks picks and begins judging. This permanently closes picks
   for that matchup, using the existing revision-checked state machine.
5. Assigned judges save their own choices. The console shows the server-saved
   choice; it does not expose another judge's unpublished choice.
6. A platform administrator confirms and publishes the official winner. This
   immediately publishes scores. “Show results” changes the shared display
   phase; it is not a second privacy/reveal gate.
7. The operator shows results, opens the next unplayed matchup, or ends the
   shared event after confirmation. Administrators may confirm a correction to
   a published result; the same scoring projection recomputes the standings.

“Stop presenting” is venue/group scoped and returns those screens to their
normal programming without ending the shared event. All-TV and named-group
presentations are independent records; stop each active record to remove both.
The player chooses among active presentations using its existing policy.
An accepted presentation request does not prove a TV has applied it or is online.
The TV polls every five seconds; the console polls every two seconds.

## Permissions and safety

| Account | Console capabilities |
| --- | --- |
| Guest or signed-out browser | No console data or staff actions |
| Read-only venue member | No console data or staff actions |
| Writable venue member | Present/stop presenting only in that venue |
| Assigned event operator with venue access | Advance/end the shared event |
| Assigned judge with venue access | Submit only their assigned judge's choices |
| Platform administrator with venue access | Create demo and publish/correct outcomes |

Existing authorization and CSRF checks remain on every mutation. Capabilities in
the read response describe those checks; they do not confer permission. Role
assignment remains a controlled provisioning task, not a new console feature.
The fixture creator is assigned as operator and as one fictional judge.

Console publication includes `expectedResultRevision`. A changed or malformed
revision is rejected with 409 before any score changes. Older publication API
clients that omit this optional field retain their original behavior; this is
not a claim of mandatory revision checks on every legacy publication client.
Phase transitions already require their current state revision for all clients.

The console disables actions when offline, after a failed/expired read, and
while a write is in flight. Writes are never automatically retried or queued.
An ambiguous network failure instructs staff to inspect refreshed server state;
it does not claim the mutation failed to reach the server. Reconnection reads
the authoritative snapshot. Guest joins/score polling preserve unfinished host
forms. Entry, venue, judge and participant names are escaped as literal text.

## Verification

- `npm run check`
- `npm test` (including `tests/game-console.test.mjs`)
- `python tests/native_browser.py`
- `python tests/activation_browser.py`

The native game flow now drives creation, presentation, local stop, phase
changes, judge submission, result publication/correction and completion through
the actual console, while retaining one real player and four guest browsers.
It checks offline control disabling, reconnection without replay, mobile layout,
HTML-shaped names, form preservation, synchronized scores, and playback/audio
restoration. Guest named-judge predictions still use the API in this acceptance
flow; their phone UI is a separate increment.

Remaining: live lobby QR, role-provisioning UI, guest judge-prediction UI,
restricted non-demo pilot, physical devices on separate networks, capacity,
multi-process coordination, and production release review. No prize or commerce
coupling is introduced.
