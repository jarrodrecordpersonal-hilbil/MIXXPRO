# Bourbon Games play polish — reconciled on f4df753

The existing MIXX TANK media/brand change arrived concurrently on PR46. This pass
preserves it: bg-media artwork, all four curated episodes, channel links, social
metadata, click-to-load replay library, its tests and the blending-core split.
The protected competition API and public isolated preview remain unchanged.

Changes: layout-only Play page places the existing watch panel beside the game on
desktop and the game action first on phones; removes the redundant marketing hero
on Play only. Existing Play/My blend/Scores and Judge/Producer navigation remains.

The actual player asks for one display name, shows one active/next matchup before
finals, moves judge predictions into an optional Bonus picks disclosure and keeps
saved choices/focus through polling. The next action is explicit, offline writes
remain disabled and matching score totals share displayed rank. No scoring-rule,
identity, deadline or publication logic changes. eventView adds format/seasonCode
for display only, using the real blending-event relationship.

An optional, initially collapsed recorded-video card on the actual player reuses
the existing four-episode catalogue and original artwork. The iframe is outside
polling-replaced markup. It loads after a click, stays during pick saves, and is
removed on closing the drawer or switching episode. Video never supplies game
results, eligibility or deadlines. Past-show prizes are not offered by the demo.
No new YouTube upload/thumbnail/account changes were performed.

YouTube links use privacy-enhanced iframe hosting, native controls and an
origin-only cross-site referrer. Game-page CSP permits only the intended iframe
and thumbnail origins, with self-only scripts. External video playback/age gates,
embedding permission and the Render deployment must still be verified on the
public HTTPS host; automated tests do not certify those external behaviors.

Validation: npm run check; npm test; tests/game_play_browser.py plus all prior
browser suites. Existing generic account/prediction assertions retained; their
browser helpers explicitly open the new Bonus picks disclosure before picking.
No merge or deployment is implied. New visuals remain an adult21+ experience.
