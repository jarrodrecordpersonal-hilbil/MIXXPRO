# Bourbon Games — interactive practice episode

## Delivered scope
Open `/rehearsal` on the existing preview service after deploying this revision.
No login, kit code, checkout, producer or invitation is required. The existing
Play page links to the episode. Original MIXX TANK / Bourbon Games assets are
reused. This is fictional practice for adult players, not a real competition,
ranked event, an official judge evaluation, or a prize offer.

Native MP4 video and an attached question panel form one phone-friendly card.
A tap saves the answer in this tab immediately; there is no final answer sheet.
The video starts on user action, plays inline, and includes scratch synthetic
narration, caption tracks and a readable host script. It is a branded animatic,
not a filmed influencer episode. No source YouTube videos are edited or reused.

## Single cue source
`apps/web/public/rehearsal/episode.json` is the editable source for video scenes,
spoken script, question choices, answer timing and the fictional result.
The first question opens at 0:34, closes at 0:54, and reveals at 1:02 in a 1:30
video. The media build generates the MP4, poster, captions and script from it.

The practice clock reads actual native-video currentTime, not wall-clock time.
Pause/buffering freezes the clock. Refresh resumes paused with this tab’s last
saved position and pick. Seeking beyond the lock seals the current run, even
when rewinding. Explicit Restart practice clears only that tab’s practice run.
Points are derived, never accumulated repeatedly on replay. Closed/revealed
questions cannot be changed except by explicitly starting a new practice run.
Session storage is not an account or an anti-cheat boundary. When it is disabled,
state is in memory only and the interface says that refreshing will lose it.

## Boundaries retained
Practice uses no live-game write API, creates no accounts, does not share the
preview captain/producer identity and never changes event standings. Live
competition continues to use its existing server-owned deadlines and published
outcomes. The current no-login Judge/Producer sandbox is unchanged.
The practice route is available only when the existing blending feature is on.
The new static route serves only an exact file allowlist, including byte ranges
for the native video. No arbitrary paths, remote media URLs or writes are allowed.
The route has self-only script/media CSP and no external tracking.

This pass does not pair a TV to phones or turn archived YouTube episodes into
ranked games. Casting/fullscreen displays the video only; keep it inline to use
the attached phone buttons. The real host/TV/live synchronization is a later,
separate integration—not an implied capability of this practice player.

## Build and deployment
`python scripts/build_rehearsal.py` requires FFmpeg, espeak-ng (or espeak), Pillow
and DejaVu fonts. The Dockerfile adds an isolated media BUILD stage and copies
only generated files to the existing Node runtime; no rendering dependencies,
keys or integrations are added to runtime. The generated binary files are ignored
by git. The existing Docker deploy command and preview environment values stay
the same. The first image build installs build tools and can take longer.

CI has a separate media/browser job using the real generated H264/AAC MP4.
Run `npm run check`, `npm test`, then `python tests/rehearsal_browser.py` after the
media build. The browser test checks actual local playback and seeks, not a
mocked clock. It checks pauses, refresh, lock/rewind, reveal, no double points,
wrong answers, reset, tab isolation, mobile fit, range requests and no live writes.

Source docs consulted: MDN HTMLMediaElement.currentTime and media buffering /
seeking / time ranges (2026-09-30). These describe native timing and seeking, not
a guarantee of every real device. Hosted Render, real iPhone/Safari and TV/cast
behavior must be checked separately. No merge or deploy is performed by this code.
