/** Curated public MIXX TANK episodes. No live event or prediction state is inferred from video. */
import {EPISODES,CHANNEL} from './bg-media/episodes.mjs';
export const SHOW_EPISODES = EPISODES.map(e=>({...e,label:`Episode ${e.episode} · ${e.title}`}));
export const SHOW_CHANNEL = CHANNEL;
const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function youtubeEmbed(id, origin) {
  if (!SHOW_EPISODES.some(episode=>episode.id===id)) throw new Error('Choose a listed MIXX TANK episode.');
  const url = new URL('https://www.youtube-nocookie.com/embed/'+id);
  url.search = new URLSearchParams({autoplay:'1',playsinline:'1',rel:'0',origin}).toString();
  return url.href;
}
// Guard keeps pure helpers importable by Node tests, without a DOM substitute.
if (typeof customElements !== 'undefined' && !customElements.get('mixx-show')) {
  class MixxShow extends HTMLElement {
    connectedCallback() {
      if (this.ready) return;
      this.ready=true; this.selected=SHOW_EPISODES[0];
      this.innerHTML=`<article class="show-card" aria-label="MIXX TANK original series">
        <header class="show-top"><img src="/bg-media/mixx-tank.png" alt="MIXX TANK Productions" width="104" height="77"><span>ORIGINAL SERIES<br><b>Recorded episodes</b></span></header>
        <div class="show-screen"></div>
        <div class="show-caption"><h2>Bourbon Games</h2><p>Watch the show that started it.</p></div>
        <label class="show-selector"><span>Choose an episode</span><select aria-label="Choose a MIXX TANK episode">${SHOW_EPISODES.map(e=>`<option value="${e.id}">${escape(e.label)} · ${e.duration}</option>`).join('')}</select></label>
        <p class="show-context">Recorded Season 1 show. Its prizes and results are separate from this game and demo.</p>
        <div class="show-links"><a class="show-youtube" target="_blank" rel="noopener" href="https://www.youtube.com/watch?v=${this.selected.id}">Watch on YouTube ↗</a><a href="${SHOW_CHANNEL}" target="_blank" rel="noopener">MIXX TANK channel ↗</a></div>
        <p class="show-help" role="status"></p>
      </article>`;
      this.querySelector('select').addEventListener('change',event=>{
        this.selected=SHOW_EPISODES.find(e=>e.id===event.target.value)||SHOW_EPISODES[0];
        this.poster();
      });
      this.poster();
    }
    poster() {
      const episode=this.selected;
      this.querySelector('.show-screen').innerHTML=`<button type="button" class="show-cover" aria-label="Watch ${escape(episode.label)} on this page">
        <span class="show-fallback"><img src="/bg-media/bourbon-games.png" alt="" width="251" height="117"></span>
        <img class="show-thumbnail" src="https://i.ytimg.com/vi/${episode.id}/hqdefault.jpg" alt="Bourbon Games episode thumbnail from MIXX TANK" width="480" height="360" loading="lazy" referrerpolicy="no-referrer">
        <span class="show-recorded">MIXX TANK · RECORDED</span><span class="show-start"><span aria-hidden="true">▶</span> Watch episode</span>
      </button>`;
      const image=this.querySelector('.show-thumbnail');
      image.addEventListener('error',()=>{image.hidden=true;});
      this.querySelector('.show-cover').addEventListener('click',()=>this.watch());
      this.posterHelp();
    }
    posterHelp() {
      this.querySelector('.show-youtube').href='https://www.youtube.com/watch?v='+this.selected.id;
      this.querySelector('.show-help').textContent='Video loads only when you press Watch. YouTube’s privacy terms apply.';
    }
    watch() {
      const frame=document.createElement('iframe');
      frame.src=youtubeEmbed(this.selected.id,location.origin);
      frame.title='MIXX TANK · '+this.selected.label+' (recorded)';
      frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';
      frame.allowFullscreen=true;
      // YouTube needs a referring origin. Do not send game-code paths or credentials.
      frame.referrerPolicy='strict-origin-when-cross-origin';
      this.querySelector('.show-screen').replaceChildren(frame);
      this.querySelector('.show-help').textContent='Press play in the video if needed. Not loading? Use Watch on YouTube above. Your picks stay here.';
      frame.focus({preventScroll:true});
    }
    stop() { if(this.querySelector('iframe')) this.poster(); }
  }
  customElements.define('mixx-show',MixxShow);
}
