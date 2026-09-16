# Launch mixxwave.com: GoDaddy + Render + Bunny

This is a prepared deployment path for **one small live pilot**, not a hosting purchase or a completed deployment. It preserves MIXXPRO's existing application and **MIXDATA** analytics. The domain remains at GoDaddy; Bunny remains the video origin/CDN. No TVs or hardware are purchased.

## 1. Create the app host

- Open Render and sign in with GitHub. Choose **New → Blueprint**, then connect `jarrodrecordpersonal-hilbil/MIXXPRO` and branch `main`.
- Render reads the root `render.yaml`. It uses JSON syntax, which is valid YAML, so the repo's Node tests can check it without dependencies.
- Review one web service named `mixxwave-pilot`, the **0.5 CPU / 512 MB** plan, and a **5 GB persistent disk** mounted at `/app/data`.
- The current published base is **$7/month compute + $1.25/month disk = $8.25/month**, on a Hobby workspace. Bunny, taxes, usage overages, backup storage and optional paid workspace features are separate. Check the actual checkout before creating it. This is a first-test budget, not an 8,000-player hosting quote.
- Enter the four requested Bunny fields in **Render's private environment settings**, not GitHub files or chat. `APP_SECRET` is generated privately by Render.
- Creating/approving the Blueprint provisions billable hosting. Do not create duplicate services or paid workspaces inadvertently. The repository change alone buys nothing.

If an existing running app host is already available, use that rather than creating a duplicate Render deployment. Match the environment names and persistent path to that host instead.

## 2. Enter the Bunny connection privately

| Render environment field | What belongs there |
| --- | --- |
| `BUNNY_LIBRARY_ID` | Your Stream library's numeric ID. |
| `BUNNY_API_KEY` | The matching Stream library API key; not the account-wide key. |
| `BUNNY_CDN_HOST` | Playback CDN hostname only; no `https://`, port, or path. |
| `BUNNY_TOKEN_KEY` | The matching direct-file CDN/Pull Zone token-authentication key, not an embed-only key. |

Do not post screenshots showing unmasked keys. Do not put credentials in the public repository, Dockerfile, build arguments, a support URL, or a CI log. A non-secret library ID/CDN hostname is enough for discussing field placement.

The Blueprint intentionally leaves R2, billing, retail checkout and music-provider credentials unset. They are not required for the first live video test. Required fields marked `sync: false` are prompted on initial Blueprint creation; subsequent secret additions/rotations are made in the service's Environment page.

## 3. Point only the website DNS at the new host

- Wait until the Render service has built and `/api/health` responds successfully. This is a basic process-health check, not proof that Bunny or the physical TV works.
- In Render's service Settings, verify `mixxwave.com` is listed under **Custom Domains**. Copy the assigned `onrender.com` hostname and the DNS instructions shown there.
- In GoDaddy, open **Domain Portfolio → mixxwave.com → DNS**. Inspect existing records before changing anything. The domain being registered at GoDaddy does not prove GoDaddy hosts its authoritative DNS; if the page says DNS is managed elsewhere, make the changes there.
- For the root domain, Render currently documents an **A** record for host `@` pointing to **216.24.57.1**. Confirm the live instructions before editing.
- For `www`, use a **CNAME** to the exact assigned `onrender.com` hostname, not the service name guessed from this document.
- Replace only conflicting website records/forwarding at `@` and `www`. In particular, remove conflicting AAAA entries **at those website names only** if present. Do not wipe the DNS zone or remove email MX, SPF, DKIM, DMARC, unrelated TXT, other subdomains, or nameserver records. Preserve a copy of the prior records for rollback.
- Return to Render and click **Verify**. Wait for domain verification and the TLS certificate. Render normally adds `www` and redirects it to the root domain when the root is configured.

`APP_ORIGIN` is already **https://mixxwave.com**. Use that exact origin for the interactive app after verification. The temporary `onrender.com` address can test health, but interactive writes from it may be rejected by the app's origin checks. Do not weaken CSRF/origin protection to bypass this.

## 4. Create the first operator account

Public signups and demo content are intentionally **off** for this pilot. In the running service's **Shell**, create the administrator account with the existing script:

```sh
npm run admin -- --email YOUR_EMAIL --name Jarrod --role admin
```

Replace `YOUR_EMAIL` with the owner's email. The script generates a password in the private shell unless you temporarily set `MIXX_ADMIN_PASSWORD` through the host's private settings. Save the generated password in your password manager; do not share the shell output. Running this script for an existing email resets that account's password/role and revokes its sessions, so use it deliberately. It is not a build or automatic startup command.

Sign in at `https://mixxwave.com`, create a test venue, and open **Connections & music** (`/setup`). Public venue self-signup can be enabled by explicitly approving the launch and setting `SIGNUPS_ENABLED=true`; the initial disabled setting is a safety gate, not a change to the intended self-serve product. A later Blueprint sync may reapply its declared false setting, so update the release configuration deliberately when opening signups.

## 5. Verify the entire video path

- Have at least one owned/approved video encoded in Bunny with an existing MP4 fallback, typically 720p. Configure playback-origin/CORS and direct-file token protection for this setup.
- Run **Bunny connection check** in `/setup`. It checks library access, signed MP4 headers, browser-origin permission and unsigned-file rejection. A green result is still **not actual video decoding**.
- In **MIXXTANK Admin**, import the Bunny catalog. Assign the video its accurate category, rights and clean/sponsorship classifications, and publish it after review.
- Open `/player/` on an existing compatible device connected to the TV. Pair its six-digit code from the venue dashboard. The phone/computer used as a remote alone does not give an incompatible TV a player.
- Play the video. Verify Pause, Play and Shuffle from the remote. Wait for a downloaded copy before trying offline playback.
- Temporarily disconnect the player from the internet, confirm the downloaded film continues within its playback lease, reconnect, and inspect **MIXDATA** (`/screens`) for the named TV's reported activity.
- Restart the app and confirm accounts, pairing and reporting survive. A physical-TV restart test remains separate from browser CI.

The app reports device playback and venue-entered locations, not human viewers or independent TV-power proof. Do not upload passwords, customer data, diagnostic databases or unmasked screenshots to the public repo.

## 6. Keep the small pilot safe

- Automatic source deploys and preview environments are off. **After creation, set Blueprint Settings → Auto Sync → No as well:** Blueprint configuration sync is separate from source auto-deploys. Inspect CI, back up, then manually sync approved configuration changes or deploy approved source releases.
- Only `/app/data` is persistent. Keep database backups off-host too; a persistent disk and its snapshots are not a substitute for a tested database restore.
- Use the existing `npm run backup` command on the running service. It creates a SQLite-consistent copy under `/app/data/backups` with the current Docker working directory. Securely transfer a copy to private backup storage and test a restore on an isolated system. The Blueprint does **not** schedule those transfers or implement a backup retention policy.
- Check actual RAM, disk growth, HTTP errors, Bunny usage and playback delivery. Do not treat the smallest plan as a network-wide capacity guarantee.
- This SQLite/disk setup is one instance only and has brief downtime during redeploys. Multi-node scaling, account recovery/MFA, load/security review, fleet qualification, music playback and real payments remain separate release work.
- `TRUST_PROXY=false` remains conservative: the existing direct-peer limiter may group traffic behind Render's proxy. That is acceptable only for the small first test; review a provider-specific trusted-proxy policy before broad signup.

## Verification boundaries

The deployment contract tests check origin/disk alignment, secret placeholders, launch gates, manual source releases, preserved analytics branding and a loopback production-config startup with migrations. They do not provision Render, query your domain's DNS, authenticate your Bunny account, test Docker hosting on Render, or buy anything. Validate the Blueprint in the real Render creation UI before approving charges.

## Official references checked for this setup

- Render Blueprint fields: https://render.com/docs/blueprint-spec
- Current compute identifiers: https://render.com/docs/compute-plans
- Hosting and disk pricing: https://render.com/pricing
- Persistent disk behavior: https://render.com/docs/disks
- Custom domain/TLS setup: https://render.com/docs/custom-domains
- DNS A/CNAME values: https://render.com/docs/configure-other-dns
- Bunny setup already documented in this repo: [MEDIA_SETUP.md](MEDIA_SETUP.md), [ACTIVATION.md](ACTIVATION.md)
