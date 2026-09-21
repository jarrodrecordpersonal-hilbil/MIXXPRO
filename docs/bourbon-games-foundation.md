# Bourbon Games: Proof Trials foundation

This increment connects the existing paired player and a public phone page to one
server-owned tasting event. It is a reviewable foundation, not the complete host
console or a production event launch. The only event-creation endpoint in this
increment creates fictional Proof Trials fixtures and requires both platform
administrator access and `DEMO_MODE=true`.

## Authority and progression

| Action | Authority and behavior |
| --- | --- |
| Present an open event | Authorized venue staff may show it on their venue's existing TV group. Presentation does not grant global event control. |
| Advance the event | An assigned event operator with venue access supplies the current state revision. Stale revisions and invalid transitions are rejected. |
| Submit a judge choice | An assigned judge may submit only for the active matchup during the open judging window, before publication. |
| Publish or correct an outcome | A platform administrator publishes the authoritative matchup result. Corrections increment its result revision and recompute standings. |
| Join and predict | A guest receives only participant access. The server enforces the active matchup, phase and deadline; the last accepted choice replaces the prior choice in the same prediction row. |
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

Operator controls and judge-prediction entry are API-driven in this increment;
the phone page provides bracket-prediction buttons. A complete host/judge UI,
live lobby QR, connection-loss UX, and a restricted non-demo pilot remain later
work. The existing player poll is five seconds and the phone poll is two seconds;
there is no frame-perfect synchronization guarantee. Tests use one local server;
multi-process coordination, capacity and physical devices on separate networks
have not been validated. There are no prizes, purchases or allocation awards.
