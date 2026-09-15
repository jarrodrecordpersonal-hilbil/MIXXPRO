# Media setup

## Bunny Stream · the venue playback library

1. Create a Stream library named **MIXXPRO**.
2. Before uploading, enable downloadable MP4 fallback, including 720p. Confirm that older uploads also have a playable MP4; enabling a switch may not retroactively create it.
3. Upload only approved, licensed films. Keep the original master separately in R2.
4. Configure the connected CDN hostname and **advanced HMAC-SHA256 token authentication** for direct files. This app uses `HS256-` signed exact-file URLs, not an iframe/embed token.
5. Permit the MIXXPRO HTTPS origin to fetch media with CORS. Test a real cross-origin download, not only iframe playback.
6. Put the library ID, server API key, CDN hostname and separate CDN token key in deployment secrets.
7. Open **MIXXTANK Admin → Import Bunny library**. Imports are draft-only. The button imports the first 100 videos; the authenticated API accepts `page` for subsequent batches.
8. Edit the film: worlds, subcategories/tags, clean-content review, premium access and sponsor flag.
9. Confirm public-venue exhibition and local-cache rights. Publish. The server verifies encoding status and the selected MP4 endpoint.
10. Pair a test player and verify video, download size, offline continuation and expiry on the actual device.

This build uses MP4s for predictable bounded offline downloads. Adaptive HLS/DASH and offline encrypted/DRM packaging are **not** implemented. Large films over the player's 300 MiB per-file cap will stream when connected but will not become cached; use suitable bitrates or shorter assets.

References: Bunny advanced tokens https://bunny.net/docs/cdn/security/token-authentication/advanced ; Stream security https://bunny.net/docs/stream/security ; MP4 downloads https://docs.bunny.net/stream/mp4-downloads .

## Cloudflare R2 · private original-file vault

1. Create a private bucket, e.g. `mixxpro-masters`. Do not enable public access.
2. Make a restricted S3 API credential for that bucket; use it only in server secrets.
3. Configure R2 account ID, bucket name, access key ID and secret.
4. Configure CORS for your exact MIXXPRO origin, method `PUT`, and request header `Content-Type`. Do not use wildcard origins unnecessarily.
5. In Admin choose **Archive original to R2**. The server issues a 15-minute SigV4 URL bound to the object key and content type; the browser uploads directly.
6. The returned object key is the archive identifier. Automatic synchronization/linkage between R2 masters and Bunny assets is not yet implemented; keep that mapping in your content operations records.

Single PUT uploads only; very large/multipart archival uploads should use your R2-compatible storage client. Presigned URLs are bearer credentials until expiry: do not publish them.

Reference: https://developers.cloudflare.com/r2/api/s3/presigned-urls/ .

## Secrets

Never put API keys into GitHub, frontend files, screenshots or chat. The public repo contains code and an empty `.env.example`, not your private media or keys.
