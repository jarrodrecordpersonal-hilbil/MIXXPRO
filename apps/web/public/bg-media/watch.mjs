import {EPISODES, videoUrl} from './episodes.mjs';
// This player lives OUTSIDE #workspace: score polling must not reload the video.
const details = document.getElementById('show-details');
const section = document.getElementById('mixxtank-watch');
const stage = document.getElementById('show-stage');
const poster = document.getElementById('show-poster');
const thumbnail = document.getElementById('show-thumbnail');
const stopButton = document.getElementById('show-stop');
let selected = EPISODES[0], frame = null, view = '';
function stop({focus = false} = {}) {
  frame?.remove(); frame = null;
  poster.hidden = false; stopButton.hidden = true;
  if (focus) poster.focus({preventScroll:true});
}
function select(episode) {
  stop(); selected = episode; stage.classList.remove('thumbnail-unavailable');
  thumbnail.src = `https://i.ytimg.com/vi/${episode.id}/maxresdefault.jpg`;
  thumbnail.alt = `Official MIXX TANK thumbnail for The Bourbon Games, Season 1 Episode ${episode.episode}`;
  poster.setAttribute('aria-label', `Watch The Bourbon Games Season 1 Episode ${episode.episode} on YouTube`);
  document.getElementById('show-external').href = videoUrl(episode.id);
  document.getElementById('show-title').textContent = episode.title;
  document.getElementById('show-episode').textContent = `Season 1 · Episode ${episode.episode} · ${episode.duration}`;
  document.querySelectorAll('[data-show-episode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.showEpisode === episode.id)));
}
thumbnail.addEventListener('error', () => {
  // Original show artwork remains available locally; no broken-image wall.
  stage.classList.add('thumbnail-unavailable');
});
poster.addEventListener('click', () => {
  if (frame) return;
  frame = document.createElement('iframe');
  frame.title = `YouTube: The Bourbon Games, Season 1 Episode ${selected.episode} — ${selected.title}`;
  frame.src = videoUrl(selected.id, true);
  frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  frame.allowFullscreen = true;
  // The rest of the app uses no-referrer. YouTube needs embedding-client identity.
  // This sends origin only cross-site, not a season code or URL query.
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  poster.hidden = true; stage.append(frame); stopButton.hidden = false;
  frame.focus({preventScroll:true});
});
stopButton.addEventListener('click', () => stop({focus:true}));
for (const episode of EPISODES) {
  const button = document.createElement('button');
  button.type = 'button'; button.dataset.showEpisode = episode.id;
  button.textContent = `Ep ${episode.episode}`;
  button.setAttribute('aria-label', `Choose Season 1 Episode ${episode.episode}`);
  button.setAttribute('aria-pressed', String(episode === selected));
  button.addEventListener('click', () => select(episode));
  document.getElementById('show-episodes').append(button);
}
details.addEventListener('toggle', () => {if (!details.open) stop();});
function syncView() {
  const next = document.body.dataset.view || new URL(location.href).searchParams.get('view') || 'play';
  if (next === view) return;
  view = next;
  const allowed = ['play','results'].includes(next);
  section.hidden = !allowed;
  // No background audio on the judge/recipe screens. Returning never autoplays.
  if (!allowed) {stop(); details.open = false;}
  else if (!frame) details.open = next === 'play';
}
new MutationObserver(syncView).observe(document.body, {attributes:true, attributeFilter:['data-view']});
syncView();
