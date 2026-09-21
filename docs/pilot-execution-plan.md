# MIXXWAVE: from working build to retailer pilot

The immediate goal is one dependable journey: **sign in → pair a TV → choose programming → publish a store billboard → run the room from a phone**. A retailer should understand each action without a developer explaining the dashboard.

This plan prioritizes that journey before adding more product surfaces. The rollout gates below are proposed acceptance targets, not measured results or claims of production readiness.

## Execution order

| Priority | Deliverable | Evidence required before moving on |
| --- | --- | --- |
| 1 · Finish the existing product | Remove the Appearance detour; simplify Schedule and Billboard; make playback controls discoverable; protect unsaved ads; show when a new UI is available. | PRs #36–#38 merged. PR #38 passed 195 automated tests on Node 22/24 and 66 browser checks. Deployment remains separate. |
| 2 · Make the first session understandable | Home shows actual pairing, player playback and billboard publication status, with a direct action for each. New venues see setup before reports or a remote. Save the chosen MIXX before first-TV pairing. | New-account desktop/phone walkthrough, failed-save recovery, persisted MIXX after pairing, viewer restrictions, and fresh status after publishing. |
| 3 · Prove daily operation | Pair and restart a player; control it from a phone; change a billboard without accidentally publishing drafts; reconnect after internet loss. | Browser acceptance plus the physical-device checklist below. A green browser suite alone does not satisfy the hardware gate. |
| 4 · Run a small retailer pilot | Recruit three willing venues using supported, known devices. Observe setup, then check operation over seven consecutive days. | Record actual setup time, assistance needed, content interruptions, successful ad publication, staff usage and every unresolved issue. Recruiting and contacting venues require the owner's involvement. |
| 5 · Expand only after the core earns it | Decide the next feature from pilot evidence: content curation, self-service event setup, sponsor inventory or another clearly observed need. | Named problem, venue evidence, owner, scope and acceptance test. Sponsor terms, payments and external provider connections require their own implementation and agreements. |

## What this implementation uses as evidence

- **Paired:** a non-revoked TV belongs to this venue. Pairing does not imply a current connection.
- **Connected:** the server has a recent heartbeat. An offline player may still be playing previously downloaded media.
- **Playback reported:** a currently connected player reports video playback. This does not verify that the physical display is switched on, audible or being watched.
- **Billboard published:** an active saved publication has not ended. Future publications are marked scheduled. Drafts, expired publications and withdrawn promotions do not satisfy this step. Publication does not guarantee immediate visibility: dates, TV group, portrait content and playback settings still apply.
- Completion comes from the server's saved state. Refreshing, using another phone or changing venues must not invent progress or lose it.

The first-use pass carries forward the useful intent of the earlier Quick Start proposal in PR #19. It derives state from venue records and player reports instead of inferring connectivity from page text.

## Before admitting a pilot venue

1. Deploy the tested commit to the existing Render service; verify the deployed source/version and the public dashboard. Refresh older open tabs once.
2. Confirm an authorized account can sign in and access the correct venue. Confirm another venue's data cannot be accessed.
3. Confirm the network has published, rights-cleared programming that actually plays on the chosen device. Include portrait video to demonstrate the split billboard. Do not use demo mode as a production shortcut.
4. Choose a supported browser device connected to the display by HDMI. Record its model, OS, browser/version, display orientation, network and audio path. Native smart-TV apps and casting are not certified by this build.
5. Confirm there is a current database backup and a known rollback deployment. This UI pass does not require a schema migration.

## Physical-device acceptance

Use the venue's actual TV and a separate phone. Observe the display; do not substitute dashboard badges for this check.

| Check | Pass condition |
| --- | --- |
| Fresh setup | Staff can sign in, find the TV player address, enter the correct code and start chosen content. Target: under 10 minutes; record the actual time and every intervention. |
| Phone control | Staff can select the correct venue/TV, pause/resume, advance, change player volume and distinguish a pending action from a confirmed result. |
| Store billboard | Staff can create a message, save it privately, publish it and see it beside portrait video. Check the QR destination when enabled. |
| Editing | Changing a draft does not change the screen until publication. Leaving an unsaved draft offers a warning. Withdrawing removes the promotion. |
| Audio | Observe hardware volume separately from player volume. Test the browser's initial playback/audio permission prompt. |
| Connection loss | After content has downloaded, disconnect the network and observe continued eligible cached playback. Reconnect and verify recovery. Uncached media is not expected to play offline. |
| Restart | Restart the browser/device with the real persistent profile. Confirm pairing, cached media and audio preferences behave as documented. |
| Multiple screens | If used, a command to one TV does not unexpectedly affect another; group/all actions reach the intended screens. |
| End of shift | Leave the system running through a full service period. Record freezes, blank video, unsuitable repetition and staff workarounds. |

If a check fails, record the exact device, time, screen state and recovery. Fix failures in this journey before adding another product feature.

## Pilot success and feedback

For each of three proposed venues, keep a dated observation log with setup time, assistance, device details, periods left running, interruptions, billboard changes and the staff member's own feedback. Treat this as operational feedback, not audience measurement.

The proposed exit gate is seven consecutive days of acceptable operation, no unresolved blocker in pairing/playback/remote/billboard publication, and staff able to repeat the core workflow unaided. Use the observed failure rate and support load to decide whether to expand; do not turn this target into a fabricated reliability percentage.

Ask three practical questions: **Would you leave this on during service? Can you change your message without help? What would make you stop using it?** Sponsor demand and customer engagement still require separate evidence.

## Keep the boundaries clear

- Room music currently has a funding/review workflow; licensed music playback is not connected.
- Paid sponsor selection, automatic sponsor payouts and retailer revenue sharing are not a completed marketplace.
- Games have existing pilot/event controls and a labeled preview. Self-service production event creation and the gated consumer/team rollout still need product decisions and implementation.
- MIXDATA reports device activity and recorded attribution. It does not count people in a store or infer physical attendance from nearby phones.
- Tests use fictional venues and disposable local databases. They do not certify physical TV compatibility or commercial demand.

## Retailer quick guide

1. Sign in at the venue dashboard on your phone or computer.
2. On the TV device, open `https://mixxwave.com/player/` and keep that page open. In the dashboard, choose **Enter TV code** and enter the six digits shown on that device.
3. Choose **MIXX**, select your programming, and use **Play on TVs**. If you choose programming before pairing, **Save & pair a TV** saves that choice first.
4. Open **My Billboard**, choose a template, edit the message, and save. Check the preview, TV group and dates, then publish. The billboard appears with eligible portrait content.
5. Return to **TV** for daily controls. In **Playback settings**, Full MIXX permits eligible ads and venue promotions; No Ads removes brand ads; Clean Screen hides ads, promotions and QR.

You can close the phone after starting playback. Keep the player device powered and its browser open. The QR displayed on TV opens its linked experience; it does not sign someone into the venue remote.
