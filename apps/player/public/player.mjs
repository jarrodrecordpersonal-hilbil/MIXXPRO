import {THEMES} from '/shared/domain.mjs';
import {get,put,all,clear,remove,cachedMedia,cacheAsset} from './offline.mjs';
const $=id=>document.getElementById(id),video=$('video');
let credential=null,manifest=null,pending=null,index=0,current=null,playbackId=null,desired=true,online=false,busy=false,flushing=false,prefetching=false,objectUrl=null,qrObject=null,lastPosition=0,lastTick=performance.now(),offset=0,signature='',lastRefresh=0,lastCommand=0,promotions=[],lastPromotion=0,cacheMessage='',waitingForMedia=false,seatBlocked=false;
const clock=()=>Date.now()+offset;
const show=(title,body,button=false)=>{$('overlay-title').textContent=title;$('overlay-body').textContent=body;$('overlay').classList.remove('hidden');$('enable').classList.toggle('hidden',!button);};
function status(message){$('player-status').textContent=message;}
async function request(path,body,secret=credential){
  const response=await fetch('/api/player'+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${secret||''}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(15000)});
  const data=await response.json();if(!response.ok){const e=new Error(data.error||'Player request failed');e.status=response.status;throw e;}return data;
}
async function event(kind,seconds=0){
  if(!current||!manifest||!playbackId)return;
  const e={key:crypto.randomUUID(),id:null,manifestId:manifest.id,contentId:current.contentId,campaignId:current.campaignId,playbackId,kind,seconds,occurredAt:clock()};e.id=e.key;
  const queued=await all('events');if(queued.length>=6000){status('Telemetry queue full · reconnect required');return;}
  await put('events',e);void flush();
}
async function flush(){
  if(flushing||!credential)return;flushing=true;
  try{const queue=(await all('events')).slice(0,100);if(queue.length){const result=await request('/events',{events:queue});for(const key of [...result.accepted,...result.rejected.map(x=>x.id)])if(key)await remove('events',key);if(result.rejected.length)status(`${result.rejected.length} old or invalid playback events discarded`);}}catch{/* Durable records remain for retry. */}finally{flushing=false;}
}
async function tick(){
  const elapsed=(performance.now()-lastTick)/1000,position=video.currentTime,progress=Math.max(0,position-lastPosition);
  lastTick=performance.now();lastPosition=position;
  if(current&&!video.paused&&!video.seeking&&video.readyState>=2&&!document.hidden&&progress>0)await event('tick',Math.max(0,Math.min(elapsed,progress,30)));
  if(current&&position>=current.playSeconds-.05&&!video.paused)await next('complete');
}
async function applyTheme(){
  const theme=THEMES.find(t=>t.id===manifest?.theme)||THEMES[0];document.body.style.setProperty('--tv-bg',theme.bg);document.body.style.setProperty('--tv-accent',theme.id==='custom'?manifest.accent:theme.color);
  $('player-top').textContent=`MIXXTANK · ${manifest.venueName}`;
}
async function refresh(force=false){
  const fresh=await request('/manifest');lastRefresh=Date.now();
  if(force||!manifest||!current){manifest=fresh;pending=null;index=0;await put('kv',{key:'manifest',value:manifest});await applyTheme();await play();}
  else if(fresh.id!==manifest.id)pending=fresh;
  void prefetch(fresh);
}
async function prefetch(target){
  if(prefetching)return;prefetching=true;
  try{
    const unique=[...new Map(target.items.map(i=>[i.cacheKey,i])).values()];
    for(const item of unique){
      if(target.expiresAt<=clock())break;
      try{await cacheAsset(item,target.expiresAt,current?.cacheKey);cacheMessage='';}catch(e){cacheMessage=e.message;break;}
    }
    const keepQR=new Set([...(manifest?.items||[]),...target.items].map(i=>'qr:'+i.qrImage));
    for(const row of await all('kv'))if(row.key.startsWith('qr:')&&!keepQR.has(row.key))await remove('kv',row.key);
    // QR images are tiny and kept with the manifest for offline viewing.
    for(const item of [...new Map(target.items.map(i=>[i.qrImage,i])).values()]){if(!item.qrImage)continue;const key='qr:'+item.qrImage;if(await get('kv',key))continue;try{const r=await fetch(item.qrImage);if(r.ok)await put('kv',{key,blob:await r.blob()});}catch{break;}}
  }finally{prefetching=false;}
}
async function play(){
  if(seatBlocked){video.pause();return;}
  if(!manifest||manifest.expiresAt<=clock()){video.pause();show('Reconnect to refresh your MIXX.','This downloaded programming window has expired.');return;}
  if(!manifest.items.length){current=null;video.pause();$('qr-box').classList.add('hidden');show('Your MIXX is ready for content.','No approved, playable videos match these choices yet. Add licensed content or choose a different MIXX.');return;}
  current=manifest.items[index%manifest.items.length];playbackId=crypto.randomUUID();
  const media=await cachedMedia(current.cacheKey,clock());
  if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=null;
  waitingForMedia=false;
  if(media){objectUrl=URL.createObjectURL(media.blob);video.src=objectUrl;}else if(online)video.src=current.url;else {waitingForMedia=true;show('This film has not downloaded yet.','Reconnect to download your next videos. Available cached films will resume automatically.');for(let n=1;n<manifest.items.length;n++){const k=(index+n)%manifest.items.length;if(await cachedMedia(manifest.items[k].cacheKey,clock())){index=k;return play();}}return;}
  if(qrObject)URL.revokeObjectURL(qrObject);const qr=await get('kv','qr:'+current.qrImage);qrObject=qr?.blob?URL.createObjectURL(qr.blob):null;$('qr').src=qrObject||current.qrImage;$('qr-box').classList.remove('hidden');
  $('overlay').classList.add('hidden');lastPosition=0;lastTick=performance.now();
  if(current.demo)status('SAMPLE FILM · test content, not a broadcast');
  if(desired){try{await video.play();await event('start');}catch{show('One tap to start.','This browser needs permission to play video.',true);}}else show('Paused from your venue remote.','Press Play in MIXXPRO to resume.');
}
let advancing=false;
async function next(reason='skip'){
  if(advancing)return;advancing=true;
  try{await event(reason);if(pending){manifest=pending;pending=null;index=(index+1)%Math.max(1,manifest.items.length);await put('kv',{key:'manifest',value:manifest});await applyTheme();}else index=(index+1)%Math.max(1,manifest?.items.length||1);await play();}finally{advancing=false;}
}
async function revoked(message){
  video.pause();credential=null;manifest=null;current=null;pending=null;await clear('media');await clear('kv');await clear('events');show('TV connection needs attention.',message);$('qr-box').classList.add('hidden');
}
async function sync(){
  if(busy||!credential)return;busy=true;
  try{
    const state=await request('/state');const restoredSeat=seatBlocked;seatBlocked=false;online=true;offset=state.serverTime-Date.now();await put('kv',{key:'clock',value:offset});promotions=state.promotions;
    const newSignature=JSON.stringify([state.mix,state.theme,state.accent]);
    if(restoredSeat||!manifest||newSignature!==signature){signature=newSignature;await refresh(true);}
    else if(Date.now()-lastRefresh>120000)await refresh(false);
    if(waitingForMedia)await play();
    for(const command of state.commands){
      if(command.id<=lastCommand){await request('/ack',{id:command.id});continue;}
      if(command.kind==='pause'){desired=false;await tick();video.pause();show('Paused from your venue remote.','Press Play in MIXXPRO to resume.');}
      if(command.kind==='play'){desired=true;if(!current)await refresh(true);else{await video.play();$('overlay').classList.add('hidden');lastTick=performance.now();lastPosition=video.currentTime;}}
      if(command.kind==='next')await next();
      if(['shuffle','apply','refresh'].includes(command.kind))await refresh(true);
      lastCommand=command.id;await put('kv',{key:'lastCommand',value:lastCommand});await put('kv',{key:'desired',value:desired});await request('/ack',{id:command.id});
    }
    const media=(await all('media')).filter(m=>m.expiresAt>clock());
    await request('/heartbeat',{cacheSeconds:Math.floor(media.reduce((n,m)=>n+m.duration,0)),cacheBytes:media.reduce((n,m)=>n+m.bytes,0),playing:!video.paused&&!!current,title:current?.title||''});
    await flush();
    if(!current?.demo)status(cacheMessage||`Connected · ${Math.floor(media.reduce((n,m)=>n+m.duration,0)/60)} min downloaded`);
  }catch(e){
    online=false;
    if(e.status===401)await revoked(e.message);
    else if(e.status===403){seatBlocked=true;video.pause();show('This TV needs an available seat.',e.message);$('qr-box').classList.add('hidden');}
    else status(seatBlocked?'Waiting for an available TV seat':'Offline · using downloaded content');
    if(!seatBlocked&&manifest&&!current&&manifest.expiresAt>clock())await play();
  }finally{busy=false;}
}
async function pair(){
  $('pair').classList.remove('hidden');$('stage').classList.add('hidden');
  let p=(await get('kv','pairing'))?.value;
  if(!p||p.expiresAt<Date.now()){p=await request('/pair',{},'');await put('kv',{key:'pairing',value:p});}
  $('pair-code').textContent=p.code;$('pair-status').textContent='Enter this code in your venue dashboard.';$('pair-help').textContent=`Expires at ${new Date(p.expiresAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`;
  const interval=setInterval(async()=>{try{const state=await request('/pair/'+p.id,undefined,p.pollToken);if(state.status==='paired'){clearInterval(interval);credential=p.deviceToken;await clear('media');await clear('events');await put('kv',{key:'credential',value:credential});await remove('kv','pairing');await run();}}catch(e){if(e.status===410){clearInterval(interval);await remove('kv','pairing');pair().catch(error=>status(error.message));}}},3000);
}
async function run(){
  $('pair').classList.add('hidden');$('stage').classList.remove('hidden');
  manifest=(await get('kv','manifest'))?.value||null;offset=(await get('kv','clock'))?.value||0;lastCommand=(await get('kv','lastCommand'))?.value||0;desired=(await get('kv','desired'))?.value??true;
  if(manifest){await applyTheme();await play();}
  await sync();setInterval(sync,5000);setInterval(()=>tick().catch(console.error),5000);
  setInterval(()=>{if(manifest&&manifest.expiresAt<=clock()){video.pause();show('Reconnect to refresh your MIXX.','This programming window has expired.');}},1000);
  setInterval(()=>{const live=promotions.filter(p=>p.starts_at<=clock()&&p.ends_at>clock());if(live.length&&Date.now()-lastPromotion>30000){const p=live[Math.floor(Date.now()/30000)%live.length];$('promo-title').textContent=p.title;$('promo-body').textContent=p.description;$('promo').classList.remove('hidden');lastPromotion=Date.now();setTimeout(()=>$('promo').classList.add('hidden'),10000);}},5000);
}
video.addEventListener('ended',()=>{const final=Math.max(0,Math.min(30,video.currentTime-lastPosition,(performance.now()-lastTick)/1000));event('tick',final).then(()=>next('complete')).catch(console.error);});
video.addEventListener('error',()=>{event('error').catch(console.error);show('We couldn’t play this film.','Checking the next available video…');setTimeout(()=>next().catch(console.error),5000);});
$('enable').onclick=async()=>{try{desired=true;await video.play();$('overlay').classList.add('hidden');lastTick=performance.now();lastPosition=video.currentTime;}catch{show('Playback is unavailable in this browser.','Use a supported browser on an HDMI-connected device.');}};
$('fullscreen').onclick=()=>document.documentElement.requestFullscreen?.().catch(()=>{});
$('sound').onclick=()=>{video.muted=!video.muted;$('sound').textContent=video.muted?'Enable sound':'Mute';};
window.addEventListener('online',()=>void sync());
async function boot(){
  if('serviceWorker'in navigator)await navigator.serviceWorker.register('/player/sw.js',{scope:'/player/'}).catch(console.warn);
  await navigator.storage?.persist?.().catch(()=>{});
  credential=(await get('kv','credential'))?.value;
  if(credential)await run();else await pair();
}
boot().catch(e=>{$('pair-status').textContent='Player setup failed: '+e.message;$('pair-help').textContent='Enable local storage and use HTTPS or localhost, then reload.';});
