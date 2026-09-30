# Bourbon Games — simple sports interface

This frontend-only pass extends the current open-preview pilot. It does not change
judging, prediction deadlines, qualification rules, permissions, migrations or data.

Primary navigation: **Play / My blend / Scores**. Judge and Producer remain visible
and usable without login in the isolated preview; normal account checks remain.
Scores load directly rather than below a large marketing header. Published blend
scores and audience prediction points are separate views. A partial reveal is not
called a flight winner or given final ranks. Completion uses existing server ranks.
No invented audience numbers, rank movements, live streams, prizes or betting odds.

Recipe controls allow typing or explicit five-percentage-point adjustments; they do
not silently rebalance the other ingredients. The total tells users how much to add
or remove. A 10/20 mL trial guide calculates measurements only for a 100% recipe.
It is not an inventory tracker or a consumption recommendation. The House Pour is
not a competition ingredient. Unsaved edits warn before tab or page navigation.

Visual target: a sports scorecard with large type and high-contrast surfaces for
adult players of varying technical confidence. The whiskey experience is 21+;
this is not youth-directed alcohol marketing. Primary controls are at least 48 px
high; tap targets and contrast follow W3C guidance as design targets, not a claim of
full WCAG certification:
- https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html
- https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html

Tests: `npm run check`, `npm test`, and `python tests/blending_sports_browser.py`.
The added test uses real Chromium and local HTTP with synthetic data. It checks
empty/partial/final scores, separated score types, late-stage controls, percent
math, draft persistence, navigation warnings, tap targets and reflow. A screenshot
is not proof of a working deployment. No Render deployment or merge is performed.
