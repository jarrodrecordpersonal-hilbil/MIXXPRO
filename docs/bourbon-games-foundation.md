# Bourbon Games: Proof Trials foundation

This increment connects the existing paired player and a public phone page to one
server-owned tasting event. The venue app now includes a host and assigned-judge
console under Settings → Bourbon Games. This remains a demo foundation, not a
production event launch. The only event-creation endpoint in this
increment creates fictional Proof Trials fixtures and requires both platform
administrator access and `DEMO_MODE=true`.

## Authority and progression

| Action | Authority and behavior |
| --- | --- |
| Present an open event | Authorized venue staff may show it on their venue's existing TV group. Presentation does not grant global event control. |
| Advance the event | An assigned event operator with venue access supplies the current state revision. Stale revisions and invalid transitions are rejected. |
| Submit a judge choice | An assigned judge may submit only for the active matchup during the open judging window, before publication. |
| Publish or correct an outcome | A platform administrator publishes the authoritative matchup result after predictions close. Each request supplies `expectedRevision` (0 for first publication); stale or missing revisions are rejected. Corrections increment the result revision and recompute standings. |
| Join and predict | A guest receives only participant access. The server enforces the active matchup, phase and deadline; the last accepted choice replaces the prior choice in the same prediction row. |
| Stop showing at one venue | Authorized venue staff can stop a presentation for their venue and TV group without ending or changing the shared event. |
| Complete an event | The event becomes final and disappears from the TV presentation on the next successful player poll. The existing programming, QR policy and audio preferences remain in effect. |

The phase sequence is lobby → predictions → judging → results. Results may open
the next matchup or complete the event. A matchup that has left predictions
cannot reopen for picks. Operators may complete an event early. Phase changes
use revision checks; they are not driven by client clocks.

## One score projection

Phone standings, result-publication responses and TV leaderboards all call
`scoreRows` in `apps/server/game-standings.mjs`:

- One point for correctly predicting the published matchup winner.
- One point for correctly predicting a named judge's submitted choice, only
  after that matchup's outcome is published.
- Result corrections update the same projection; no separate TV scoring query.
- Equal scores display in name, then participant-ID order. This is display
  ordering, not a prize or allocation tie-break rule.

Participant names and event entry names are rendered as text. They cannot add
elements or markup to the phone or TV display.

## Identity and reconnects

A browser credential resolves to one participant per event. A one-use resume
code adds another device to that participant without rotating other devices'
credentials. Revoked credentials, used/expired codes, and a destination already
bound to another participant are rejected. Linking another device does not add
another scored identity. Reloading a phone retains its participant and stored
predictions. Starting a fresh anonymous browser is not identity verification.

## Verification and current limits

- Node regressions exercise publication visibility, late actions, phase
  revision conflicts, result corrections, device-link conflicts and rollback,
  and identical phone/TV bracket-plus-judge scores.
- Native Chromium uses one existing paired TV and four independent 390px guest
  browsers. It verifies actual picks, reload identity, guest authorization,
  literal HTML-shaped names, score corrections and end-of-event restoration.
- The inherited native suite still verifies real video, pairing, audio,
  cached/offline playback, profiles, environments and telemetry.

## Host and judge workflow

Open Settings → Bourbon Games in the signed-in venue app. Read-only venue
members do not have host access. The console supports:

1. Choose an existing event. In demo mode an administrator can open the fictional
   Proof Trials fixture; opening it again does not reset completed events.
2. Request presentation on all venue TVs or a named TV group. The UI labels this
   as a request, not a playback receipt. Stop showing removes only that venue's
   selected presentation.
3. Assigned operators choose an unused matchup and open a timed or untimed
   prediction window, then close predictions and start judging.
4. Assigned judges submit or update their own choices during the judging window.
   Only the assigned judge and platform administrators can read an unpublished
   choice from the host API; ordinary venue hosts and event operators cannot.
5. Administrators publish the active matchup winner, review a confirmation, and
   correct previously published results. Revision checks reject stale writes.
6. Operators show results, open the next unused matchup, or end the event.
   Ending prompts a confirmation because it closes the event everywhere.

The console polls every three seconds without discarding a focused form. Stale
phase/result actions fail with an explicit message and refresh the event. A lost
connection disables mutations until the host refreshes; uncertain mutations are
not retried automatically. Navigating away stops polling. Judge-account and
operator assignments remain provisioning tasks, not editable in this console.

Native browser coverage runs these host/judge actions through the actual UI,
including two conflicting host tabs, failed requests and recovery, desktop and
390px layout, publication/correction, literal names, and TV restoration. The
four independent guest browsers still submit judge predictions through the API;
the guest phone page currently exposes bracket-prediction buttons only.

Guest judge-prediction controls, live lobby QR, guest/TV connection-loss UX,
event/role provisioning, and a restricted non-demo pilot remain later work. A
dedicated visual pass with real brand and programming assets remains before
calling the full guest/TV experience polished. The existing player poll is five seconds and the phone poll is two seconds;
there is no frame-perfect synchronization guarantee. Tests use one local server;
multi-process coordination, capacity and physical devices on separate networks
have not been validated. There are no prizes, purchases or allocation awards.
