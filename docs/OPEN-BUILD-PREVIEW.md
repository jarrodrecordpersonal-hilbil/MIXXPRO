# Bourbon Games — public open-build preview

For the **separate preview service only**, add `BLENDING_OPEN_PREVIEW=true`.
Keep `DEMO_MODE=false`. Use the existing Dockerfile and start command. In this
mode `apps/server/main.mjs` starts the dedicated preview wrapper rather than the
normal application. APP_ORIGIN can come from Render's RENDER_EXTERNAL_URL.
A hosted production-mode preview requires an HTTPS origin.

The root URL opens `/blending/TRYBG`. The Judge and Producer buttons require no
sign-in. Select any of three demo judges, edit and lock their example cards,
open/close predictions, reveal results and create an example team entry. A
"Lock demo scorecards" helper fills out the rehearsal without scoring 18 cards
manually; it locks existing example drafts, never changes already-locked cards.
"Reset demo" clears the shared demo for everyone and restores its fictional data.

**This is a shared public sandbox, not live judging.** Anyone with its address can
operate the demo and inspect/change test entries. Use no real personal details or
private recipes. Clear preview labels appear on the entry and prediction pages.

Data is held only in memory and is regenerated on restart, redeploy or reset.
**It does not use the persistent disk described in earlier setup instructions.**
No production DB_PATH is opened or migrated; it is deliberately ignored. All
payment/media/provider credentials are ignored. Accounts are synthetic, have no
usable passwords, and no administrator cookie is delivered to browsers. Only
allowlisted blending and guest-prediction routes are available; unrelated admin,
venue, authentication, billing, webhook and provider APIs return 404.

Remove the flag (or set it to false) to return to the normal account-protected
application. That normal startup uses DB_PATH and normal migrations again. Do
not enable the preview flag on the existing MIXXWAVE service. This change does
not merge or deploy anything and does not resolve tournament-launch blockers.

Validation: `node --experimental-sqlite --test tests/blending-open-preview.test.mjs`
and `python tests/blending_open_preview_browser.py`. The latter exercises actual
Chromium/HTTP without admin cookies or API mocks.

