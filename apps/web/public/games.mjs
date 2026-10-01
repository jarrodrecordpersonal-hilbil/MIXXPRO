const h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const code=decodeURIComponent(location.pathname.split('/').filter(Boolean)[1]||'').toUpperCase();
const venueCode=new URL(location.href).searchParams.get('v')||'', $=id=>document.getElementById(id);
let state=null,connected=false,busy=false,polling=false,generation=0,offset=0,renderKey='',uncertain=false,accountUserId=null;
const bonusOpen=new Set();
let pendingPickFocus=null;
function rememberPickFocus(){const node=document.activeElement?.closest('[data-pick]');if(node)pendingPickFocus={...node.dataset};}
function restorePickFocus(){if(!pendingPickFocus||busy)return;const data=pendingPickFocus;pendingPickFocus=null;const node=[...document.querySelectorAll('[data-pick]')].find(n=>n.dataset.matchup===data.matchup&&n.dataset.kind===data.kind&&n.dataset.judge===data.judge&&n.dataset.entry===data.entry);if(node&&!node.disabled)node.focus({preventScroll:true});}
const clock=()=>Date.now()+offset;
const feedback=message=>{$('feedback').textContent=message;};
async function api(path,body){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetch(path.startsWith('/api/')?path:'/api/public/games/'+encodeURIComponent(code)+path+(venueCode?'?v='+encodeURIComponent(venueCode):''),{
      method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json',...(state?.account?.csrf?{'X-CSRF-Token':state.account.csrf}:{})},body:body===undefined?undefined:JSON.stringify(body),credentials:'same-origin',cache:'no-store',signal:controller.signal
    });
    const data=await response.json();
    if(!response.ok){const error=new Error(data.error||'Request failed.');error.status=response.status;throw error;}return data;
  }finally{clearTimeout(timer);}
}
function open(matchupId){
  const e=state?.event;
  return connected&&!!state?.participant&&e.status==='live'&&e.phase==='predictions'&&e.activeMatchupId===matchupId&&(!e.phaseDeadline||e.phaseDeadline>clock())&&!e.outcomes.some(o=>o.matchupId===matchupId);
}
function controls(){
  document.body.dataset.connected=String(connected);
  document.querySelectorAll('[data-pick]').forEach(b=>b.disabled=busy||!open(b.dataset.matchup));
  document.querySelectorAll('#join-form button,#resume-form button,#link-device,#account-panel button,#account-mode,#team-join').forEach(b=>b.disabled=busy||!connected);
  $('retry').disabled=busy||polling;
  restorePickFocus();
}
function updateClock(){
  if(!state)return;
  const e=state.event,left=e.phaseDeadline?Math.max(0,Math.ceil((e.phaseDeadline-clock())/1000)):null;
  $('countdown').textContent=connected&&left!==null&&['predictions','judging'].includes(e.phase)?String(left):'';
  $('status').textContent=e.status==='final'?'Final results':e.phase==='predictions'?(left===0?'Predictions closed':'Make your picks before time runs out.'):e.phase==='judging'?'Judges are deciding.':e.phase==='results'?'Results are in.':'Waiting for the host.';
  const isOpen=e.phase==='predictions'&&e.status==='live'&&(left===null||left>0);
  const remaining=e.matchups.filter(m=>!e.outcomes.some(o=>o.matchupId===m.id)).length;
  $('next-step').textContent=!connected?'Reconnecting. Your last confirmed picks are kept.':!state.participant&&e.status!=='final'?'Enter a name below to join. No account or purchase needed.':isOpen?'Tap one sample below. A check mark confirms your saved pick.':e.status==='final'?'This event is finished. Your published points are below.':e.phase==='results'?(remaining?'Result published. Stay here—the next round will appear automatically.':'All matchups revealed. Final standings follow when the host ends the event.'):'You’re in. The host will open the next pick here.';
  controls();
}
function render(data){
  state=data;
  document.body.dataset.format=data.event.format||'prediction';
  const isBlend=data.event.format==='blending';
  $('watch-drawer').hidden=!isBlend;
  if(isBlend){$('game-brand-image').src='/bg-media/bourbon-games.png';$('game-brand-image').alt='Bourbon Games';$('game-brand-home').href='/blending/'+encodeURIComponent(data.event.seasonCode);$('game-brand-home').setAttribute('aria-label','Bourbon Games home');$('game-home-link').href='/blending/'+encodeURIComponent(data.event.seasonCode)+'?view=results';$('game-home-link').textContent='Scores';}
  offset=data.serverTime-Date.now();
  $('open-preview-banner')?.classList.toggle('hidden',!data.openPreview);
  $('title').textContent=data.event.name;$('event-code').textContent=data.event.code;
  $('venue-context').textContent=data.venue?'Joining through '+data.venue.name:venueCode?'This venue link is not currently active.':'At the venue. At home. In the game.';
  if(venueCode&&!data.venue){const home=document.createElement('a');home.href='/games/'+encodeURIComponent(code);home.textContent=' Join from home instead.';$('venue-context').append(home);}
  const final=data.event.status==='final',joined=!!data.participant;
  $('join').classList.toggle('hidden',joined||final);$('resume').classList.toggle('hidden',joined);$('play').classList.toggle('hidden',!joined&&!final);
  $('device-tools').classList.toggle('hidden',!joined||data.account?.linked);
  $('player-name').textContent=data.participant?.display_name||'Guest';
  $('my-score').textContent=(data.standings.find(row=>row.participantId===data.participant?.id)?.totalPoints||0)+' pts';
  $('player-strip').classList.toggle('hidden',!joined);
  renderAccount(data);
  renderTeams(data);
  const key=JSON.stringify([data.event,data.participant,data.predictions,data.standings]);
  if(key!==renderKey){
    renderKey=key;
    rememberPickFocus();
    const names=new Map(data.event.entries.map(e=>[e.id,e.name]));
    const visible=final?data.event.matchups:data.event.activeMatchupId?data.event.matchups.filter(m=>m.id===data.event.activeMatchupId):data.event.matchups.filter(m=>!data.event.outcomes.some(o=>o.matchupId===m.id)).slice(0,1);
    const picks=(m,kind,judgeId,label)=>{
      const saved=data.predictions.find(p=>p.matchupId===m.id&&p.kind===kind&&p.judgeId===judgeId);
      return `<fieldset class="pick-group" data-pick-group="${h(kind)}" data-judge="${h(judgeId)}"><legend>${h(label)}</legend><div class="pick">${[m.entryAId,m.entryBId].map(id=>`<button type="button" data-pick data-matchup="${h(m.id)}" data-kind="${kind}" data-judge="${h(judgeId)}" data-entry="${h(id)}" aria-pressed="${saved?.entryId===id?'true':'false'}" aria-label="Pick ${h(names.get(id))}"><span>${saved?.entryId===id?'✓ SAVED':'YOUR PICK'}</span><strong>${h(names.get(id))}</strong></button>`).join('')}</div><p class="pick-note">${saved?'Saved: '+h(names.get(saved.entryId)):open(m.id)?'Choose one. You can change it while predictions are open.':'No pick saved for this matchup.'}</p></fieldset>`;
    };
    $('matchups').innerHTML=visible.map(m=>{
      const result=data.event.outcomes.find(o=>o.matchupId===m.id);
      return `<article class="game-panel"><p class="eyebrow">ROUND ${h(m.round)} / MATCH ${h(m.slot)}</p><h2 class="match-title">${h(names.get(m.entryAId))}<em>VERSUS</em>${h(names.get(m.entryBId))}</h2>${result?`<p class="result-callout">Published winner: <strong>${h(names.get(result.winnerEntryId))}</strong>${result.revision>1?' · Corrected result':''}</p>`:''}${joined?picks(m,'bracket','','Who wins the matchup?')+(data.event.judges.length?`<details class="bonus-picks" data-bonus="${h(m.id)}" ${bonusOpen.has(m.id)?'open':''}><summary>Bonus picks · Read the judges <span>Optional</span></summary><p class="fine">Earn an extra point for each correct judge pick.</p>${data.event.judges.map(j=>picks(m,'judge',j.id,'Who will '+j.name+' choose?')).join('')}</details>`:''):''}</article>`;
    }).join('');
    let rank=0,previousPoints;
    $('standings').innerHTML=data.standings.map((row,i)=>{if(row.totalPoints!==previousPoints)rank=i+1;previousPoints=row.totalPoints;return `<div ${row.participantId===data.participant?.id?'data-self':''}><span>${rank}. ${h(row.name)}</span><b>${h(row.totalPoints)} pts</b></div>`;}).join('')||'<p class="muted">The field is open. Your name could be first.</p>';

  }
  updateClock();
}
function renderAccount(data){
 const a=data.account||{};
 if(accountUserId!==a.userId){$('account-games').textContent='';$('link-code').textContent='';accountUserId=a.userId;}
 $('account-panel').classList.toggle('hidden',!a.enabled);
 $('account-entry').classList.toggle('hidden',!!a.signedIn);$('account-signed').classList.toggle('hidden',!a.signedIn);
 $('account-summary').textContent=a.linked?'Your player account':'Keep your game';
 $('account-status').textContent=a.signedIn?`${a.email} · ${a.linked?'This player and its picks are saved to your account.':a.profile?'Save this player to keep its picks, or join the event with your account.':'Choose a public player name to start.'}`:'';
 $('profile-form').classList.toggle('hidden',!a.signedIn||!!a.profile);
 $('account-save').classList.toggle('hidden',!a.profile||!data.participant||a.linked);
 if(a.profile&&!data.participant&&document.activeElement!==$('guest-name'))$('guest-name').value=a.profile.displayName;
}
function renderTeams(data){
 const rules=data.event.teamRules;
 $('team-panel').classList.toggle('hidden',!rules||!data.account?.enabled);
 if(!rules)return;
 $('team-rule').textContent=rules.description;
 $('my-team').textContent=data.myTeam?`Your store: ${data.myTeam.name} · ${data.teams.find(t=>t.venueId===data.myTeam.venueId)?.points||0} pts. ${rules.locked?'Roster locked.':'Your place is saved.'}`:rules.locked?'Rosters are locked. Your individual picks still count.':!data.account?.linked?'Save your player to an account, then join through your store’s game QR.':data.venue?`${rules.size} players for ${data.venue.name}. Your store is fixed when you join; rosters close when predictions open.`:'Scan a participating store’s game QR to join its team.';
 const local=data.teams.find(t=>t.venueId===data.venue?.id),canJoin=data.account?.linked&&data.venue&&!data.myTeam&&!rules.locked&&(!local||local.memberCount<rules.size);
 $('team-join').classList.toggle('hidden',!canJoin);$('team-join').textContent=data.venue?'Join '+data.venue.name+' team':'Join this store team';
 if(!data.myTeam&&!rules.locked&&local?.memberCount>=rules.size)$('my-team').textContent='This store team is full. Your individual picks still count.';
 $('team-standings').innerHTML=data.teams.map(t=>`<div ${t.venueId===data.myTeam?.venueId?'data-self':''}><span>${t.rank===null?'':t.rank+'. '}${h(t.name)}<small>${t.memberCount}/${t.capacity} players · ${t.status==='incomplete'?'Incomplete roster · unranked':t.status==='competing'?'Roster locked':t.status==='ready'?'Ready to compete':'Forming'}</small></span><b>${t.points} pts</b></div>`).join('')||'<p class="muted">Store rosters are open. Be first to represent yours.</p>';
}
function disconnected(error){
  connected=false;
  $('connection').textContent=error?.status?error.message:state?'Connection lost · showing your last confirmed picks. Reconnecting…':'Unable to connect. Retrying…';
  updateClock();controls();
}
async function refresh(){
  if(busy||polling)return;polling=true;const version=generation;
  try{const data=await api('');if(version!==generation)return;connected=true;render(data);$('connection').textContent='Connected · picks synced';if(uncertain){feedback('Reconnected. Showing what the server saved; no action was retried.');uncertain=false;}}
  catch(error){if(version===generation)disconnected(error);}
  finally{polling=false;controls();}
}
async function mutate(path,body,message){
  if(busy||!connected)return;rememberPickFocus();busy=true;generation++;controls();feedback('Saving…');
  try{
    const result=await api(path,body),data=await api('');connected=true;render(data);$('connection').textContent='Connected · picks synced';
    feedback(message);return result;
  }catch(error){
    if(error.status){feedback(error.message);try{render(await api(''));connected=true;}catch{disconnected();}}
    else{uncertain=true;feedback('We could not confirm your last action. Reconnecting will check what was saved; your action will not be sent again automatically.');disconnected();}
  }finally{busy=false;controls();}
}
$('matchups').addEventListener('toggle',event=>{const el=event.target;if(el.isConnected&&el.matches('[data-bonus]')){if(el.open)bonusOpen.add(el.dataset.bonus);else bonusOpen.delete(el.dataset.bonus);}},true);
$('watch-drawer').addEventListener('toggle',()=>{if(!$('watch-drawer').open)$('watch-drawer').querySelector('mixx-show')?.stop();});
$('matchups').addEventListener('click',event=>{
  const b=event.target.closest('[data-pick]');if(!b||b.disabled)return;
  const entry=state.event.entries.find(e=>e.id===b.dataset.entry)?.name||'';
  void mutate('/predict',{matchupId:b.dataset.matchup,entryId:b.dataset.entry,kind:b.dataset.kind,judgeId:b.dataset.judge},'Saved: '+entry+'.');
});
$('join-form').onsubmit=event=>{event.preventDefault();const f=new FormData(event.target);void mutate('/join',{name:f.get('name'),locationKind:venueCode?'venue':'home',...(venueCode?{venueCode}:{})},'You’re in. Your picks stay with this player on this browser.');};
$('resume-form').onsubmit=event=>{event.preventDefault();void mutate('/resume',{code:new FormData(event.target).get('code')},'Your player and saved picks are restored.');};
$('link-device').onclick=async()=>{const result=await mutate('/link-device',{},'Resume code created.');if(result)$('link-code').textContent=result.code+' · one use · valid for 10 minutes';};
$('account-mode').onchange=()=>{const create=$('account-mode').value==='register';$('account-name-field').classList.toggle('hidden',!create);$('account-name').required=create;$('account-password').minLength=create?12:1;$('account-password').autocomplete=create?'new-password':'current-password';$('account-submit').textContent=create?'Create account':'Sign in';if(create&&!$('account-name').value)$('account-name').value=state?.participant?.display_name||'';};
$('account-form').onsubmit=async event=>{event.preventDefault();const create=$('account-mode').value==='register';try{await mutate('/api/public/game-account/'+(create?'register':'login'),Object.fromEntries(new FormData(event.target)),create?'Account created. Save this player to keep its picks.':'Signed in. Your saved player is restored when you already joined this event.');}finally{$('account-password').value='';}};
$('profile-form').onsubmit=event=>{event.preventDefault();void mutate('/api/public/game-account/profile',Object.fromEntries(new FormData(event.target)),'Player profile created. Save this player to keep its picks.');};
$('account-save').onclick=()=>void mutate('/save-account',{},'Player saved. Sign in on any device to restore these picks.');
$('account-logout').onclick=()=>void mutate('/api/auth/logout',{},'Signed out. Your account and saved picks are protected.');
$('account-history').onclick=async()=>{const result=await mutate('/api/public/game-account',undefined,'Your saved games are ready.');if(result)$('account-games').innerHTML=result.history.map(e=>`<p><a href="/games/${encodeURIComponent(e.code)}">${h(e.name)}</a> · ${e.points} pts · ${h(e.status)}</p>`).join('')||'<p>No saved games yet.</p>';};
$('password-form').onsubmit=async event=>{event.preventDefault();try{await mutate('/api/public/game-account/password',Object.fromEntries(new FormData(event.target)),'Password updated. Your other devices are signed out.');}finally{$('current-password').value='';$('new-password').value='';}};
$('team-join').onclick=()=>void mutate('/team',{venueCode},'Your store team place is saved for this event.');
$('retry').onclick=()=>void refresh();
window.addEventListener('offline',()=>disconnected());window.addEventListener('online',()=>void refresh());
void refresh();setInterval(refresh,2000);setInterval(updateClock,250);
