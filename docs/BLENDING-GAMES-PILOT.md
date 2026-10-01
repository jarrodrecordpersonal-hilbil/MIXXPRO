# Bourbon Games: join-anytime blending pilot

Status: feature-branch pilot, not approved for production. Based on MIXXPRO main
`04f48472a93e6d9db3a6e14e64ac6e1c763eb955`. No production database, provider account,
merge, or deployment is part of this change.

## What is built

`/blending` and `/blending/:seasonCode` add **JOIN & PLAY** and **ENTER A BLEND** to
the existing system. `/play` exposes the format only when the pilot API is enabled.
The prediction button opens the existing `/games/:eventCode` player. Accounts,
cookies, CSRF, guest credentials, QR generation, event projection, prediction
locks, outcomes, venue presentation and audience points remain shared.

Teams have a private saved recipe using the producer's exact component codes and
batch descriptions. Percentages use integer basis points: 25% = 2500, total 10000.
Drafts can be incomplete but cannot exceed 100%. A submitted recipe cannot change.
A captain can operate one team per season. Team registration is not a six-team cap.

New entrants are routed to the next accepting, non-full batch whose deadline has
not passed. A draft does not reserve a place. A changed destination requires fresh
confirmation; no silent reassignment. Entries after all windows close are explicitly
queued, not admitted to a locked championship. The captain can explicitly place a
queued entry into a new eligible batch in the same season. Cross-season transfer
is **not implemented**; do not imply that queueing guarantees a date or a place.

A prepared final locks championship intake for that season. Qualified teams submit
a fresh final recipe; prior scores do not carry forward. Each team earns at most
one championship place. Reserved slots are configurable across Round 1 (late 2026),
Round 2 (first half 2027), last-chance qualification, and the final (Q4 2027).
Do not compare scores from different panels as though they were one judging flight.

The producer privately prepares a blind sample packing map after the recipe
cutoff, with at least two submitted blends. Judges use existing accounts and see
only assigned anonymous sample codes and their own cards. Each judge scores
aroma/palate/balance/finish from 0 to 25. Draft cards may be revised; locked cards
are immutable in API and database triggers. A captain cannot judge their own batch.
Manual conflict-of-interest checks beyond account identity remain an operator duty.

All cards must be locked before the first reveal. Producer controls open a
prediction window, close picks, then publish actual score-derived results. Public
API responses do not contain unreleased scores, private recipes, judge notes,
judge account emails, or blind team mappings. Generic phase, judge-submit and
manual-winner endpoints cannot override a blending event. The official table is
separate from audience points, with per-round audience results so late arrivals
have a fresh round to play.

Prediction matchups are spotlight reveals, not elimination brackets. An odd-size
flight reuses the first sample in the last spotlight; official standings count
each blend once. Each prediction round uses the existing scoring rules.

## Run a disposable preview

Requires Node 22.16+ (Node 24 recommended). No npm dependency installation.

```sh
PORT=3359 node --experimental-sqlite tests/blending-demo-server.mjs
# Open http://127.0.0.1:3359/blending/BLEND26
```

This creates fictional teams, components and judge accounts. All pages label it as
a test. It prepares six submitted blends, leaving one scorecard for a real UI action.
The console prints the producer/judge test logins and missing-card score. Password
for these synthetic `.test` accounts: `Blending-Pilot-Only-2026!`.
Producer: `pilot-1@example.test`; judges: `pilot-2@example.test` through
`pilot-4@example.test`. Do not reuse these accounts or credentials on a live site.

Use Judge desk to sign in as the first judge, fill the one unlocked card with the
score printed in the console for each criterion, and lock it. Use another browser
profile for the producer; open predictions in Producer desk. Use a private window
or a separate device on an explicitly configured local network for audience play.
Join another viewer during the reveal and open the next prediction. Create a new
captain account under Enter a blend and verify the next-batch destination.

The fixture defaults to an in-memory database, is rejected in production, and will
refuse an existing DB_PATH file. An optional NEW DB_PATH retains this test run for
inspection only; it is not a production database or a supported resume command.
The fixture never inherits real payment, media, or commerce provider configuration.

## Integration / feature flag

On an approved staging host use `BLENDING_GAMES_ENABLED=true` and the existing
`GAME_ACCOUNTS_ENABLED=true`. A fresh normal deployment seeds **no** competitions,
judges, recipes or scores. Create a season and batches with an existing admin account.
Actual components and batch identifiers must be set before the first entry exists;
components then freeze to protect recipe reproducibility. Names, future batch
rosters and dates remain editable subject to preserved promises and revisions.

Migration 013 is additive. Like existing migrations, it runs when the application
opens its configured database, **even if the feature flag is off**. Deploying code
therefore also requires an approved backup/migration/rollback plan. No database was
migrated outside isolated local tests. The unrelated PR #24 was not changed.

## Validation

```sh
npm run check
npm test
python tests/blending_browser.py
```

Browser testing uses Playwright, real HTTP, independent browser contexts, and a
new temporary SQLite database, not intercepted API fixtures. CI installs the same
isolated Playwright/Chromium tools as the existing native browser suite. Screenshots
and a structured report go to `artifacts/blending/`.

Automated server tests include stale revisions, concurrent last-slot submission,
mid-show joining, refresh/login persistence, private-data redaction, immutable
scores, publication rollback, exact ties, qualification uniqueness, and preservation
of existing migration-012 data when migration 013 is applied twice.

## Still required before a public competition

- Real component inventory/fulfillment procedure, independent judge panel and
  verified account assignments, official dates/rules and conflict disclosures.
- A rehearsal with real households/venues; browser/device and load/security review.
- Password recovery/email verification (inherited pilot limitation); no claim that
  the 21+ checkbox verifies identity or legal eligibility.
- A separately reviewed alcohol shipping/commerce and promotion/prize process.
  No payment, cash prize or allocation promise is implemented here.
- Hosted video production/broadcast. Producer controls do not create a livestream.
- Exact tied score vectors require a separate blind tie-break. Matchup publication
  safely blocks and qualification ties leave affected places unawarded. The
  tie-break resolution workflow itself is **not implemented**; do not run a real
  tournament until a reviewed process exists. Never edit locked original cards.
- Cross-season queue handling. The pilot does not silently move recipes or users.

Sponsors and purchased bottle quantities never alter judging or audience points.
