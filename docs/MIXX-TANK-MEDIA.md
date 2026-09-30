# MIXX TANK media and original branding

Adds a Watch the show section without another primary tab. Play shows it expanded;
Scores keeps it below the scoreboard and initially collapsed. Judge, Producer and
recipe views do not show it. Videos never start on page load. The YouTube iframe
exists outside the score-rendering root so polling does not restart it; changing
episode, closing the section or leaving for a working desk removes the iframe.

Four curated public Season 1 episodes from @MixxTankProductions are defined in
`apps/web/public/bg-media/episodes.mjs`, not represented as a live channel feed.
Their real YouTube thumbnails are used unchanged. Replays and the prior show's
prizes/results are explicitly separate from the new at-home game/demo. No YouTube
channel metadata or uploaded thumbnail has been changed. Normal controls and
YouTube branding remain visible. An external watch link handles age restrictions,
embedding restrictions, ad blockers and provider failures without bypassing them.

Original MIXX TANK and Bourbon Games PNG marks are extracted from the user's
`_MixxTank_Brand_Guide.pdf` page 1 (primary black MIXX TANK and primary red Bourbon
Games), with proportional web sizing and PNG palette optimization. No mark was redrawn, stretched or
filtered. The older synthetic badge is not deleted or altered for other apps.
Blending-page accents now use the guide's black and #f15e39. Marks include alpha
masks from the PDF. Page 2 is the color reference. The guide itself is not published.

Sharing metadata uses the real Episode 1 thumbnail and the Bourbon Games / MIXX
TANK title, never unpublished demo scores or team recipes. Social-platform cache
refresh and actual thumbnail presentation must be checked after deployment.

The HTTP view wrapper serves only named assets and extends CSP only for the
YouTube thumbnail host and privacy-enhanced player. `blending-core.mjs` is the
byte-identical previous competition route module; all scoring and authorization
logic remains unchanged. The open-preview allowlist admits only the added media
files, not general filesystem access. No new provider credentials or migrations.

Sources, checked 2026-09-30:
- Channel and episode IDs/titles/durations: vidIQ YouTube search restricted to
  @MixxTankProductions, channel UCh-Ms_s-6v1wtgYJg6kHa5A.
- https://www.youtube.com/watch?v=Lp71Y_h9ZmM
- https://www.youtube.com/watch?v=zNaXMhUye7k
- https://www.youtube.com/watch?v=N2aIKmpguVA
- https://www.youtube.com/watch?v=_2eh87yEy9Q
- https://developers.google.com/youtube/player_parameters
- https://developers.google.com/youtube/terms/required-minimum-functionality
- https://support.google.com/youtube/answer/171780

Validation: npm run check; npm test; tests/blending_media_browser.py. The browser
suite uses real local app HTTP and a STUB of the external YouTube iframe solely to
test creation, referrer and lifecycle deterministically. It does not establish
actual video playback/embedding permission, end-to-end Render playback or social
share previews. Those require hosted verification. Original game/browser suites
remain in CI. No merge/deployment/YouTube-account write is performed by this pass.
