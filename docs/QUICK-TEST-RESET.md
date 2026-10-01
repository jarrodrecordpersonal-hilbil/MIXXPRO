# Quick-test reset — user rejected the narrated slideshow

Default `/rehearsal` is now a direct, silent UI test: pick either sample, reveal,
try again. Choices and reveal control fit together on the phone's first screen.
There is no video element, media download, mandatory introduction, account, kit
code, countdown or live scoring submission. It is explicitly a fictional practice
round. This is not a substitute for a real host-led episode.

The original marks are retained. Selected cards use a high-contrast orange fill,
with a check mark and text rather than color alone. The main controls remain
keyboard accessible. Pick and result use this tab's `:quick:v` storage key, separate
from the optional timed run; storage failure falls back honestly to in-memory state.
A restored result is derived rather than added again. Reset touches only this run.

The existing 90-second timing test remains at `/rehearsal?mode=video`. Its
media-time locks and tests are retained. Its video is now a SILENT storyboard:
espeak and every generated audio track are removed, not merely muted. The cue
sheet still supplies host copy for later recording. The old timed player remains a separate technical check; it is no longer the
first experience. Live host controls and server deadlines are untouched.

The existing preview Judge/Producer access, replay library, original logos,
normal-mode authorization, production database handling and commerce remain
unchanged. Only named quick assets are added to the static allowlist.

The prior Docker smoke probe failed on connection reset immediately after start,
not during its media build or browser tests. It now waits with a bounded readiness
loop, retains the health/page/range assertions, and records container logs even on
failure. The media builder no longer installs or invokes a synthetic voice engine.

## Validation
Run `npm run check`, `npm test`, `python scripts/build_rehearsal.py`, then
`python tests/quick_practice_browser.py` and `python tests/rehearsal_browser.py`.
CI also checks that the generated MP4 has zero audio streams, and builds/smokes
the deployment image. The quick browser test uses real application HTTP, verifies
no media load and no live API writes, and deliberately injects one network failure
and one storage-access failure. Prior video-timing assertions remain.

Actual Render and physical-phone verification are separate from local/CI tests.
No merge, Render deployment, real judging result or new human-host recording is
implied. A previously opened copy updates only after the preview is deployed and
refreshed.

Storage reference: https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage
