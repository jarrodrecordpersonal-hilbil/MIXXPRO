# Deployment and launch checklist

## Local pilot

Node 22.16+; `cp .env.example .env`; `npm start`. No `npm install` is needed. `DEMO_MODE=true` is local-only and visibly labelled. `npm run admin` provisions operator accounts. The generated password must be delivered privately; no default production password is seeded.

## One-host HTTPS deployment

1. Use a persistent Linux host and a domain you control. Point DNS to the host.
2. Copy `.env.example` to `.env` **outside Git**. Set `APP_DOMAIN=venue.example.com`, `APP_ORIGIN=https://venue.example.com`, and a random 32+ character `APP_SECRET`.
3. Set `SIGNUPS_ENABLED=false` while conducting the invite-only pilot. Production rejects demo mode; demo files are not included in the Docker image.
4. Add Bunny, R2, Stripe and merchant keys through the deployment secret store. None is required merely to start; related operations remain disabled until configured.
5. Run `docker compose up --build -d`. Caddy terminates HTTPS. Port 3000 is not publicly exposed; Caddy overwrites `X-Real-IP`, the only proxy IP header trusted by this configuration.
6. Provision the admin inside the app container. Inspect `/api/health`, then log in over HTTPS.
7. Back up the database and move encrypted backups off-host. `npm run backup` uses SQLite's consistent snapshot operation. Perform a restore test on a separate host.

Docker/Compose assets are supplied but were **not executed in the authoring environment**. Test them on your host before exposing signup or accepting payments. Use updated base images and keep Node/OS patches current. Do not run multiple app replicas against the same SQLite file.

## Required acceptance before a real venue launch

- [ ] Apply real prices, commission terms, cancellation terms and executed agreements.
- [ ] Verify content exhibition, music and offline-copy rights. Confirm clean-content ratings manually.
- [ ] Test Bunny signatures/CORS and R2 private uploads with actual credentials.
- [ ] Complete Stripe test-mode purchase, seat updates, cancellation and webhook retry scenarios.
- [ ] Connect the licensed merchant and verify real test scan-to-order-to-refund attribution.
- [ ] Conduct actual-device TV pairing, HDMI output, muted autoplay/audio, network interruption, reboot, storage eviction and lease-expiry tests.
- [ ] Confirm staff cannot accidentally exit playback on the chosen commercial hardware; browser PWA is not a native kiosk watchdog.
- [ ] Perform security review, authorization/abuse testing, accessibility review, load testing and restore drills.
- [ ] Add self-service email verification/recovery and MFA/SSO as required before unrestricted signup; the pilot currently uses operator provisioning/reset.
- [ ] Establish privacy notices, retention policy, incident handling, commercial insurance/protection and installation procedures with qualified advisers.
- [ ] Establish payout onboarding and reconciliation. Recording a payout here does not send it.
- [ ] Monitor database growth and migrate to a multi-node architecture before expanding beyond the single-host pilot.

## Non-goals of this delivery

No automatic public deployment, DNS purchase, paid service purchase, TV hardware purchase, account-key discovery, real contract signing or insurance coverage has been performed. No mobile/TV app-store package or human audience measurement has been certified.
