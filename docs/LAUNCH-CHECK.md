# One clear launch check

Run this on the deployment host after adding the private configuration to `.env` or the host's secret manager:

```sh
npm run doctor
# Machine-readable, without npm's banner:
node --env-file-if-exists=.env scripts/doctor.mjs --json
```

The output is a short checklist, not another setup wizard:

- **OK:** The named configuration requirement is present and structurally acceptable.
- **WARNING:** A missing optional integration, commercial choice, or unverified launch requirement needs attention.
- **ERROR:** A runtime or core production configuration requirement is invalid. The process exits with status 1.

**OK does not mean a provider connection worked.** The command makes no provider calls, sends no emails, uploads nothing, charges nothing, and never grants production approval. It does not print secret values. Missing fields are listed by variable name only.

## Media activation

- Complete Bunny Stream setup and register/import approved MP4 fallbacks.
- Keep R2 originals private, with bucket-scoped credentials and the app's CORS origin.
- Pair one test TV/player before a venue rollout.
- Confirm video, remote commands, actual downloads, offline continuation, expiration and reconnection using that device.

## Commercial activation

- Approve per-TV prices and commission terms; do not treat defaults as approved pricing.
- Run subscription and retailer order/refund tests in sandbox accounts first.
- Payout records do not execute bank transfers.
- Funded equipment and installation require a qualifying signed, approved, active **5- or 10-year agreement**. An application is not approval, a signature or insurance coverage.

## Release evidence

The CI workflow runs the full syntax/terminology and Node test suite on Node 22 and Node 24. Each run retains its test output for 14 days. A successful Node 24 run also retains an exact tracked-source ZIP, commit identifier and SHA-256 checksum.

The archive contains only Git-tracked source; it does not copy the running host's environment or database. Keep private files out of Git at all times. CI source packaging is not a hosting deployment and does not certify physical TV behavior, native IndexedDB reboot durability, provider credentials or legal/commercial readiness.

See `QA.md`, `DEPLOYMENT.md`, `MEDIA_SETUP.md` and `INTEGRATIONS.md` for the runtime's complete requirements and test-method limitations.
