const $=id=>document.getElementById(id);
const h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let session, snapshot=null, eventId='', generation=0, signature='', healthy=false, pending=false, refreshing=false, offset=0;

async function api(path,body){
  const response=await fetch(path,{method:body===undefined?'GET':'POST',credentials:'same-origin',signal:AbortSignal.timeout(10000),
    headers:{'Content-Type':'application/json','X-CSRF-Token':session?.csrf||'','X-Venue-Id':$('venue').value},
    body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok)throw Error(data.error||'Request failed.');
  return data;
}
function connection(ok,message){healthy=ok;$('connection').dataset.stale=String(!ok);$('connection').textContent=message;availability();}
function availability(){
  const deadline=snapshot?.event.phaseDeadline,expired=deadline&&deadline<=Date.now()+offset;
  for(const node of $('workspace').querySelectorAll('button,input,select'))node.disabled=!healthy||pending||node.dataset.closed==='true'||(node.dataset.judgeSubmit==='true'&&!!expired);
  $('venue').disabled=pending;$('event').disabled=pending;$('create-demo').disabled=pending;
}
function tick(){
  if(!snapshot)return;
  const deadline=snapshot.event.phaseDeadline,left=deadline?Math.max(0,Math.ceil((deadline-Date.now()-offset)/1000)):null;
  $('countdown').textContent=left===null?'—':String(left);
  $('clock-label').textContent=!healthy?'State unconfirmed':left===0?'Window closed':left===null?'No deadline':'Seconds remaining';
  availability();
}
function render(data){
  snapshot=data;offset=data.serverNow-Date.now();
  $('standings').innerHTML=data.standings.map((x,i)=>`<div><span>${i+1}. ${h(x.name)}</span><b>${h(x.totalPoints)} pts</b></div>`).join('')||'<p>No participants yet.</p>';
  // A joining guest or a score refresh must not destroy a host's in-progress form.
  const {serverNow,standings,...stable}=data,key=JSON.stringify(stable);
  if(key===signature){tick();return;}
  signature=key;
  const {event:e,permissions:p}=data,names=new Map(e.entries.map(x=>[x.id,x.name])),active=e.matchups.find(m=>m.id===e.activeMatchupId),final=e.status==='final';
  const title=m=>`Round ${m.round} · Match ${m.slot}: ${names.get(m.entryAId)} vs ${names.get(m.entryBId)}`;
  const choices=(m,selected)=>[m.entryAId,m.entryBId].map(id=>`<option value="${h(id)}" ${id===selected?'selected':''}>${h(names.get(id))}</option>`).join('');
  $('workspace').hidden=false;$('event-name').textContent=e.name;$('phase').textContent=`${e.phase.toUpperCase()} · REVISION ${e.stateRevision}`;
  $('guest-link').href='/games/'+encodeURIComponent(e.code);$('guest-link').textContent='Guest join code: '+e.code;
  const oldGroup=$('group').value;
  $('group').innerHTML='<option value="">All TVs in this venue</option>'+data.groups.map(group=>`<option value="${h(group)}">${h(group)}</option>`).join('');
  if(data.groups.includes(oldGroup))$('group').value=oldGroup;
  $('present-form').querySelector('button').dataset.closed=String(final);
  $('presentations').innerHTML=data.presentations.map(x=>`<div><span>Requested: ${h(x.groupName||'All TVs in this venue')}</span><button class="secondary" data-stop-group="${h(x.groupName)}">Stop presenting</button></div>`).join('');
  for(const button of $('presentations').querySelectorAll('button'))button.onclick=()=>mutate(()=>api(`/api/games/${e.id}/stop-presenting`,{groupName:button.dataset.stopGroup}),'Local presentation stopped; TVs update on their next poll.');

  const available=e.matchups.filter(m=>!data.lockedMatchupIds.includes(m.id)&&!e.outcomes.some(o=>o.matchupId===m.id));
  $('host-controls').innerHTML=!p.canOperate?'<p>You may present this event locally, but only its assigned operator can advance it.</p>':final?'<p>This event is complete. Ordinary TV programming resumes on the next successful player poll.</p>':
    `${active?`<p>${h(title(active))}</p>`:''}${['lobby','results'].includes(e.phase)&&available.length?`<form id="open-picks"><label>Next matchup<select name="matchupId">${available.map(m=>`<option value="${h(m.id)}">${h(title(m))}</option>`).join('')}</select></label><label>Prediction window (seconds)<input name="seconds" type="number" value="120" min="5" max="3600" required></label><button>Open predictions</button></form>`:''}<div class="actions">${e.phase==='predictions'?'<button id="begin-judging">Lock picks & begin judging</button>':''}${e.phase==='judging'&&e.outcomes.some(o=>o.matchupId===e.activeMatchupId)?'<button id="show-results">Show results</button>':''}<button id="complete" class="danger">End event</button></div><p class="muted">Phase changes affect every presenting venue. Closed matchups cannot reopen for picks.</p>`;
  if($('open-picks'))$('open-picks').onsubmit=ev=>{ev.preventDefault();const f=new FormData(ev.target);mutate(()=>phase('predictions',f.get('matchupId'),Number(f.get('seconds'))),'Predictions opened.');};
  if($('begin-judging'))$('begin-judging').onclick=()=>mutate(()=>phase('judging',e.activeMatchupId),'Picks locked. Judging is open.');
  if($('show-results'))$('show-results').onclick=()=>mutate(()=>phase('results',e.activeMatchupId),'Showing results.');
  if($('complete'))$('complete').onclick=()=>{if(confirm('End this shared event for everyone? Remaining matchups will not be played.'))mutate(()=>phase('complete',null),'Event ended. TVs return to normal programming on their next poll.');};

  const myJudges=e.judges.filter(j=>p.judgeIds.includes(j.id)),outcome=e.outcomes.find(o=>o.matchupId===active?.id);
  $('judge-controls').innerHTML=!myJudges.length?'<p>No judge role is assigned to your account for this event.</p>':!active?'<p>Waiting for the operator to open a matchup.</p>':myJudges.map(j=>{
    const saved=data.mySubmissions.find(s=>s.matchupId===active.id&&s.judgeId===j.id),open=e.phase==='judging'&&!final&&!outcome;
    return `<form class="judge-card" data-judge="${h(j.id)}"><h3>${h(j.name)}</h3><p>${saved?'Saved choice: '+h(names.get(saved.winnerEntryId)):'No choice submitted for this matchup.'}</p><label>Your tasting winner<select name="winnerEntryId" data-closed="${!open}">${choices(active,saved?.winnerEntryId)}</select></label><button data-judge-submit="true" data-closed="${!open}">${open?'Save judge choice':'Judging closed'}</button></form>`;
  }).join('');
  for(const form of $('judge-controls').querySelectorAll('form'))form.onsubmit=ev=>{ev.preventDefault();const f=new FormData(form);mutate(()=>api(`/api/games/${e.id}/judge-submit`,{matchupId:active.id,judgeId:form.dataset.judge,winnerEntryId:f.get('winnerEntryId')}),'Judge choice saved by the server.');};

  const publishable=e.matchups.filter(m=>e.outcomes.some(o=>o.matchupId===m.id)||(m.id===active?.id&&['judging','results'].includes(e.phase)));
  $('result-controls').innerHTML=!p.canPublish?'<p>Only a platform administrator can publish or correct the official winner.</p>':!publishable.length?'<p>Publication becomes available after predictions close and judging begins.</p>':publishable.map(m=>{
    const result=e.outcomes.find(o=>o.matchupId===m.id);
    return `<form class="result-card" data-result="${h(m.id)}" data-revision="${result?.revision||0}"><h3>${h(title(m))}</h3><p>${result?'Published winner: '+h(names.get(result.winnerEntryId))+' · revision '+result.revision:'No result published.'}</p><label>Official winner<select name="winnerEntryId">${choices(m,result?.winnerEntryId)}</select></label><button>${result?'Correct published result':'Publish winner'}</button></form>`;
  }).join('');
  for(const form of $('result-controls').querySelectorAll('form'))form.onsubmit=ev=>{
    ev.preventDefault();const f=new FormData(form),winner=f.get('winnerEntryId'),revision=Number(form.dataset.revision);
    if(confirm(`${revision?'Correct the result to':'Publish'} ${names.get(winner)}? This updates everyone's score.`))mutate(()=>api(`/api/admin/games/${e.id}/publish-outcome`,{matchupId:form.dataset.result,winnerEntryId:winner,expectedResultRevision:revision}),'Official result saved. Shared scores have been recomputed.');
  };
  tick();
}
function phase(name,matchupId,seconds){return api(`/api/games/${eventId}/phase`,{phase:name,matchupId,expectedRevision:snapshot.event.stateRevision,...(seconds===undefined?{}:{seconds})});}
async function refresh(){
  if(!eventId||refreshing)return;
  if(!navigator.onLine){connection(false,'Offline. Controls paused; no actions will be queued.');return;}
  const current=generation,target=eventId;refreshing=true;
  try{const data=await api(`/api/games/${target}/console`);if(current!==generation||!navigator.onLine)return;render(data);connection(true,'Connected · displaying the latest server state.');}
  catch(error){if(current===generation)connection(false,'Connection or access unavailable. Controls paused. '+error.message);}
  finally{refreshing=false;}
}
async function mutate(action,message){
  if(pending||!healthy)return;
  pending=true;availability();$('notice').textContent='Sending…';
  // Invalidate any earlier in-flight read so it cannot replace post-action state.
  generation++;
  try{await action();$('notice').textContent=message;}
  catch(error){$('notice').textContent=error.message+' The action was not automatically retried. Review the refreshed state before trying again.';connection(false,'Checking the current server state…');}
  finally{pending=false;connection(false,'Refreshing the authoritative state…');await refresh();availability();}
}
async function loadEvents(preferred=''){
  generation++;snapshot=null;eventId='';signature='';$('workspace').hidden=true;connection(false,'Loading available events…');
  const current=generation;
  try{
    const data=await api('/api/games/console');if(current!==generation)return;
    $('event').innerHTML=data.events.map(e=>`<option value="${h(e.id)}">${h(e.name)}${e.status==='final'?' (complete)':''}</option>`).join('');
    if(data.events.some(e=>e.id===preferred))$('event').value=preferred;
    $('create-demo').hidden=!data.canCreateDemo;$('empty').hidden=!!data.events.length;
    eventId=$('event').value;connection(true,'Connected.');await refresh();
  }catch(error){if(current===generation)connection(false,error.message);}
}
$('present-form').onsubmit=ev=>{ev.preventDefault();const groupName=$('group').value;mutate(()=>api(`/api/games/${eventId}/present`,{groupName}),'Presentation requested. Check the selected TVs.');};
$('venue').onchange=()=>loadEvents();
$('event').onchange=()=>{generation++;eventId=$('event').value;snapshot=null;signature='';$('workspace').hidden=true;connection(false,'Loading event…');refresh();};
$('create-demo').onclick=async()=>{
  if(pending||!healthy)return;pending=true;availability();
  try{const data=await api('/api/admin/games/proof-trials-demo',{});await loadEvents(data.id);$('notice').textContent='Fictional demo ready. Existing demos are reused, not reset.';}
  catch(error){$('notice').textContent=error.message+' Creation was not automatically retried.';}
  finally{pending=false;availability();}
};
window.addEventListener('offline',()=>connection(false,'Offline. Controls paused; no actions will be queued.'));
window.addEventListener('online',()=>refresh());
try{
  session=await api('/api/session');
  const venues=session.venues.filter(v=>v.role!=='viewer');
  if(!venues.length)throw Error('A writable venue membership is required.');
  $('venue').innerHTML=venues.map(v=>`<option value="${h(v.id)}">${h(v.name)}</option>`).join('');
  $('setup').hidden=false;await loadEvents();
}catch(error){connection(false,error.message+' Sign in through MIXXWAVE, then return to this page.');}
setInterval(()=>{if(!pending)refresh();},2000);
setInterval(tick,250);
