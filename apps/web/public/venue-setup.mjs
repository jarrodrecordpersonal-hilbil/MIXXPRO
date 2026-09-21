const h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** Current evidence, never a guessed completion flag or browser-local checklist. */
export function setupState({tvs=[],billboards={total:0,published:0,scheduled:0}}){
 const paired=tvs.length,online=tvs.filter(tv=>tv.online).length,playing=tvs.filter(tv=>tv.online&&tv.playing).length;
 return {paired,online,playing,billboards,
  heading:!paired?'Get your first screen playing.':!online?'Your TV is paired. Let’s reconnect it.':!playing?'Your TV is connected. Start your MIXX.':!billboards.published?'Your programming is playing. Make it yours.':'Your room is up and running.'};
}

export function venueSetup({tvs,setup,role,venue,worlds,origin}){
 const state=setupState({tvs,billboards:setup?.billboards}),canEdit=role!=='viewer';
 const mix=Object.keys(venue.mix.worlds).map(id=>worlds.find(world=>world.id===id)?.name||id).join(' + ');
 const action=(label,page)=>`<button type="button" class="btn secondary small" data-action="nav" data-page="${page}">${label} →</button>`;
 const tvStatus=state.paired?`${state.paired} paired · ${state.online} connected`:'Not paired yet';
 const billboardStatus=state.billboards.published?`${state.billboards.published} published${state.billboards.scheduled?' · '+state.billboards.scheduled+' scheduled':''}`:state.billboards.total?'Draft saved':'Optional';
 return `<section class="venue-setup" data-venue-setup aria-labelledby="venue-setup-title">
  <div class="venue-setup-head"><div><div class="eyebrow">PAIR · PLAY · PROMOTE</div><h2 id="venue-setup-title">${state.heading}</h2><p>${canEdit?'Everything you need to get the room going.':'View only. An owner or manager can finish setup and control playback.'}</p></div><button type="button" class="btn ghost small" data-action="refresh-venue">Refresh status</button></div>
  <ol class="venue-setup-steps">
   <li data-setup-step="pair" data-ready="${!!state.paired}"><div class="venue-step-top"><span class="venue-step-number">1</span><span class="badge ${state.paired?'':'off'}">${tvStatus}</span></div><h3>Connect your TV</h3><p>${state.paired?state.online?'Your paired player is checking in. Use TV to manage the screen.':'Keep the player open on the TV device and check its connection. An offline screen may still be playing downloaded content.':`On the TV device, open <strong>${h(origin)}/player/</strong>. Then enter its six-digit code here.`}</p>${state.paired?action('Manage TVs','tvs'):`<button type="button" class="btn small" data-action="pair" ${canEdit?'':'disabled'}>Enter TV code →</button>`}</li>
   <li data-setup-step="play" data-ready="${!!state.playing}"><div class="venue-step-top"><span class="venue-step-number">2</span><span class="badge ${state.playing?'':'off'}">${state.playing?'Playback reported':'Waiting for playback'}</span></div><h3>Choose your programming</h3><p>Saved venue choice: <strong>${h(mix)}</strong>. ${state.playing?'Your player reports that video is running.':'Choose the worlds for your room, then play them on your TV.'}</p>${action(canEdit?'Choose MIXX':'View MIXX','mixx')}</li>
   <li data-setup-step="billboard" data-ready="${!!state.billboards.published}"><div class="venue-step-top"><span class="venue-step-number">3</span><span class="badge ${state.billboards.published?'':'off'}">${billboardStatus}</span></div><h3>Add your store message</h3><p>${state.billboards.published?'Publication is saved. It appears during its scheduled window beside eligible portrait videos; TV settings still apply.':'Use a template, add your message, preview it and publish when ready. Your TV can play without a billboard.'}</p>${action(canEdit?state.billboards.total?'Open my billboard':'Create a billboard':'View billboards','commerce')}</li>
  </ol>
  <details class="venue-setup-help"><summary>Using your phone? Here’s how the two screens work.</summary><p>Sign in to this dashboard on your phone to manage the same venue. Keep <strong>${h(origin)}/player/</strong> open on the device attached to the TV. You can close your phone after starting playback.</p><p>The QR shown during programming opens its linked experience. It does not grant venue remote access.</p></details>
 </section>`;
}
