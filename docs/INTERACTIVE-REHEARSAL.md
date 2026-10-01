# Bourbon Games — practice and episode timing

The user-facing entry at `/rehearsal` is now an instant, silent quick test.
See `QUICK-TEST-RESET.md` for the reset of the original narrated slideshow.

The technical synchronized video remains at `/rehearsal?mode=video`. It is a
silent storyboard, not a finished host episode. No login, kit code or host is
needed. Its question opens at 0:34, closes at 0:54 and reveals at 1:02. It reads
native MP4 playback time; pause/buffering pauses the practice clock. Seeking past
a deadline seals that run, including after rewind. Refresh restores its local
state paused; restart clears this practice run only.

`episode.json` remains the common source for the samples, fictional result,
scene timings and future host-recording script. `build_rehearsal.py` produces the
silent MP4, poster, visual caption track and unrecorded host script. FFmpeg,
Pillow and DejaVu fonts are build-stage dependencies; no text-to-speech engine or
runtime media-rendering dependency is used. The generated video has no audio track.

Quick-test and timed-run storage keys are separate. Neither writes to a live
game API, grants qualifications, awards prizes, evaluates an actual blend or
provides an anti-cheat boundary. Production identities, server-owned prediction
deadlines and the existing no-login preview judge/producer sandbox are unchanged.

The practice HTTP route only serves named assets and GET/HEAD. It supports MP4
byte ranges and self-only scripts/media. Native fullscreen/casting does not pair
phones or carry answer buttons; use inline video for the timed check. No TV pairing
or physical Safari/iPhone qualification is implied by Chromium CI.

The Docker build generates the media once and copies only output into the
existing Node runtime. CI tests instant play, real MP4 timing and the actual
container startup. Hosted playback still needs checking after a preview deploy.
