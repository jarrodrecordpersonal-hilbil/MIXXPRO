const h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const phaseLabels={lobby:'Lobby',predictions:'Predictions open',judging:'Judging',results:'Results',complete:'Complete'};
const opts=items=>items.map(([value,label])=>`<option value="${h(value)}">${h(label)}</option>`).join('');

export function gameHostPage(){
  return `<header class="header"><div><div class="eyebrow">BOURBON GAMES</div><h1>Run the tasting.</h1><p>One event, shared by your screens and everyone playing along.</p></div></header><div data-game-host class="game-host"><p role="status" data-host-status aria-live="polite">Loading events…</p><div data-host-content></div></div>`;
}

export function mountGameHost({root,api,demo,isAdmin}){
  let events=[],selected='',snapshot=null,busy=false,polling=false,generation=0,disposed=false,connected=false,renderedKey='';
  const content=root.querySelector('[data-host-content]'),status=root.querySelector('[data-host-status]');
  const say=message=>{if(!disposed)status.textContent=message;};
  const disable=()=>root.querySelectorAll('button,select,input').forEach(el=>el.disabled=busy||(!connected&&el.dataset.hostAction!=='refresh'));
  const entry=id=>snapshot.event.entries.find(e=>e.id===id)?.name||'Unknown entry';
  const matchupName=m=>`${entry(m.entryAId)} vs ${entry(m.entryBId)}`;
  function form(action,body,label,extra=''){
    return `<form data-host-form="${action}" ${extra}>${body}<button class="btn" type="submit">${label}</button></form>`;
  }
  function draw(){
    if(disposed)return;
    const previous=selected;
    content.innerHTML=`<section class="panel"><div class="section-head"><h2>Choose an event</h2><button type="button" class="btn secondary small" data-host-action="refresh">Refresh</button></div>${events.length?`<label class="field"><span class="label">Event</span><select data-host-event aria-label="Event">${opts(events.map(e=>[e.id,e.name+' · '+phaseLabels[e.phase]]))}</select></label>`:'<p>No events are available yet.</p>'}${demo&&isAdmin?'<button type="button" class="btn secondary" data-host-action="demo">Open fictional demo</button><p class="small">Uses the existing Proof Trials test event. It does not reset completed events.</p>':''}</section><div data-host-event-panel></div>`;
    const select=content.querySelector('[data-host-event]');if(select)select.value=previous;
    if(!snapshot){disable();return;}
    const {event:e,capabilities:c,assignedJudges,submissions,lockedMatchupIds,tvGroups,presentations,standings}=snapshot;
    const active=e.matchups.find(m=>m.id===e.activeMatchupId),final=e.status==='final',outcome=id=>e.outcomes.find(o=>o.matchupId===id);
    const available=e.matchups.filter(m=>!lockedMatchupIds.includes(m.id)&&!outcome(m.id));
    const expired=e.phaseDeadline&&e.phaseDeadline<=Date.now();
    const presentable=['open','live'].includes(e.status)&&tvGroups.length>0;
    let controls='';
    if(c.canControl&&!final){
      if(['lobby','results'].includes(e.phase)&&available.length)controls+=form('phase',`<input type="hidden" name="phase" value="predictions"><label class="field"><span class="label">Next matchup</span><select name="matchupId" aria-label="Next matchup">${opts(available.map(m=>[m.id,matchupName(m)]))}</select></label><label class="field"><span class="label">Prediction window</span><select name="seconds" aria-label="Prediction window">${opts([['60','1 minute'],['120','2 minutes'],['300','5 minutes'],['','Until you close it']])}</select></label>`,'Open predictions');
      if(e.phase==='predictions')controls+=form('phase','<input type="hidden" name="phase" value="judging">','Close predictions & start judging');
      if(e.phase==='judging')controls+=form('phase','<input type="hidden" name="phase" value="results">','Close judging & show results');
      controls+='<button type="button" class="btn secondary" data-host-action="complete">End event</button><p class="small">Ending closes this event everywhere and returns connected TVs to their programming.</p>';
    }
    if(!c.canControl&&!final)controls='<p>You can present this event. Only its assigned operators can change the phase.</p>';
    const judgeForms=assignedJudges.map(j=>{
      const saved=submissions.find(s=>s.judgeId===j.id&&s.matchupId===active?.id);
      const open=active&&e.phase==='judging'&&!final&&!expired&&!outcome(active.id);
      return `<article class="game-host-card"><h3>${h(j.name)}</h3>${saved?`<p data-host-judge-saved>Your saved choice: <b>${h(entry(saved.winnerEntryId))}</b></p>`:''}${open?form('judge',`<input type="hidden" name="judgeId" value="${h(j.id)}"><label class="field"><span class="label">${h(j.name)} winner</span><select name="winnerEntryId" aria-label="${h(j.name)} winner" required><option value="">Choose an entry</option>${opts([active.entryAId,active.entryBId].map(id=>[id,entry(id)]))}</select></label>`,saved?'Update judge choice':'Submit judge choice'):'<p class="small">Judge choices are accepted only during the active judging window, before publication.</p>'}</article>`;
    }).join('');
    const results=e.matchups.map(m=>{
      const published=outcome(m.id),canPublish=c.canPublish&&(published||(!final&&active?.id===m.id&&['judging','results'].includes(e.phase)));
      const choices=submissions.filter(s=>s.matchupId===m.id);
      return `<article class="game-host-card" data-host-matchup="${h(m.id)}"><h3>${h(matchupName(m))}</h3><p>${published?`Published winner: <b>${h(entry(published.winnerEntryId))}</b> · Result ${published.revision}`:'No result published yet.'}</p>${c.canPublish&&choices.length?`<p class="small">Judge submissions: ${choices.map(s=>h(e.judges.find(j=>j.id===s.judgeId)?.name)+': '+h(entry(s.winnerEntryId))).join(' · ')}</p>`:''}${canPublish?form('publish',`<input type="hidden" name="matchupId" value="${h(m.id)}"><input type="hidden" name="expectedRevision" value="${published?.revision||0}"><label class="field"><span class="label">${published?'Corrected winner':'Matchup winner'}</span><select name="winnerEntryId" aria-label="${published?'Corrected winner':'Matchup winner'}" required><option value="">Choose an entry</option>${opts([m.entryAId,m.entryBId].map(id=>[id,entry(id)]))}</select></label>`,published?'Publish correction':'Publish winner'):''}</article>`;
    }).join('');
    content.querySelector('[data-host-event-panel]').innerHTML=`<section class="section panel"><div class="section-head"><div><div class="eyebrow">${h(e.code)}</div><h2>${h(e.name)}</h2></div><span class="badge" data-host-phase>${h(phaseLabels[e.phase])}</span></div><p>${active?h(matchupName(active)):'Waiting for the first matchup.'}</p>${e.phaseDeadline&&!final?`<p class="small">${expired?'Window ended':'Window ends'} ${h(new Date(e.phaseDeadline).toLocaleTimeString())}. The operator advances the event.</p>`:''}<p><a href="/games/${encodeURIComponent(e.code)}" target="_blank" rel="noopener">Open guest page</a> · ${standings.length} participants</p><ol class="game-host-phases" aria-label="Event phases">${Object.entries(phaseLabels).map(([phase,label])=>`<li ${e.phase===phase?'aria-current="step"':''}>${label}</li>`).join('')}</ol></section>
      <div class="section grid cols2"><section class="panel"><h2>Your venue’s TVs</h2>${presentable?form('present',`<label class="field"><span class="label">TV group</span><select name="groupName" aria-label="TV group">${opts([['','All TVs in this venue'],...tvGroups.filter(g=>g.name).map(g=>[g.name,g.name+' · '+g.count+' TVs'])])}</select></label>`,'Show event on TVs'):final?'<p>The event has ended. TVs return to their normal programming.</p>':'<p>Pair a TV from the TV page to present this event.</p>'}${!final?presentations.map(p=>`<div class="list-row"><span>Requested: ${h(p.groupName||'All TVs in this venue')}</span><button type="button" class="btn secondary small" data-host-action="stop" data-group="${h(p.groupName)}">Stop showing</button></div>`).join(''):''}<p class="small">Connected TVs update at their next check-in. Stopping a presentation affects only this venue and keeps the shared event running.</p></section><section class="panel"><h2>Event controls</h2>${final?'<p>Final results. This event is closed.</p>':controls}</section></div>
      ${judgeForms?`<section class="section panel"><h2>Your judge seat</h2>${judgeForms}</section>`:''}
      <section class="section panel"><h2>Matchup results</h2>${!c.canPublish?'<p class="small">The platform administrator publishes and corrects winners.</p>':''}${results}</section>
      <section class="section panel"><h2>Standings</h2><p class="small">One point per correct bracket winner and named judge prediction, after publication.</p>${standings.length?`<ol class="game-host-standings">${standings.map(s=>`<li><span>${h(s.name)}</span><b>${s.totalPoints} pts</b></li>`).join('')}</ol>`:'<p>No one has joined yet. Share the guest page to invite participants.</p>'}</section>`;
    disable();
  }
  async function read(force=false,version=generation){
    const list=await api('/games');if(disposed||version!==generation)return;
    const nextId=list.events.some(e=>e.id===selected)?selected:list.events[0]?.id||'';
    const next=nextId?await api('/games/'+encodeURIComponent(nextId)+'/host'):null;
    if(disposed||version!==generation)return;
    events=list.events;selected=nextId;
    connected=true;
    const key=JSON.stringify([events,selected,next,!!(next?.event.phaseDeadline&&next.event.phaseDeadline<=Date.now())]);
    if(force||key!==renderedKey){
      // Preserve an in-progress choice; the server still checks its original revision.
      if(!force&&content.contains(document.activeElement)&&document.activeElement.closest('form')){
        say('The event has updates. Finish your choice or refresh to review them.');return;
      }
      snapshot=next;renderedKey=key;draw();
    }
  }
  async function run(action,message='Updated.'){
    if(busy||disposed)return;busy=true;generation++;disable();
    try{await action();if(disposed)return;await read(true);say(message);}
    catch(error){
      if(error.status===409){
        try{await read(true);}catch{connected=false;}
        say(error.message+' Your action was not applied. Review the current event before trying again.');
      }else{
        connected=false;say(error.status?error.message:'Connection interrupted. Refresh to check whether your last action was saved before trying again.');
      }
    }finally{busy=false;if(!disposed)disable();}
  }
  root.addEventListener('change',event=>{
    if(event.target.matches('[data-host-event]')){selected=event.target.value;run(async()=>{},'Event loaded.');}
  });
  root.addEventListener('click',event=>{
    const button=event.target.closest('[data-host-action]');if(!button||button.disabled)return;
    const action=button.dataset.hostAction;
    if(action==='refresh')return run(async()=>{},'Up to date.');
    if(action==='demo')return run(async()=>{const result=await api('/admin/games/proof-trials-demo',{});selected=result.id;},'Fictional demo opened.');
    if(action==='stop')return run(()=>api('/games/'+selected+'/stop-presenting',{groupName:button.dataset.group}),'Presentation stopped for that group.');
    if(action==='complete'&&confirm('End this event for everyone? Predictions and judging will close, and TVs will return to their programming.'))return run(()=>api('/games/'+selected+'/phase',{phase:'complete',expectedRevision:snapshot.event.stateRevision}),'Event ended.');
  });
  root.addEventListener('submit',event=>{
    const form=event.target.closest('[data-host-form]');if(!form)return;event.preventDefault();
    if(busy||!connected||!form.reportValidity())return;
    const b=Object.fromEntries(new FormData(form)),action=form.dataset.hostForm;
    if(action==='phase'){
      b.expectedRevision=snapshot.event.stateRevision;
      b.matchupId=b.matchupId||snapshot.event.activeMatchupId;
      if(b.seconds==='')delete b.seconds;else if(b.seconds!==undefined)b.seconds=Number(b.seconds);
      return run(()=>api('/games/'+selected+'/phase',b),'Event phase updated.');
    }
    if(action==='present')return run(()=>api('/games/'+selected+'/present',b),'Presentation requested. Check the TV to confirm it is showing.');
    if(action==='judge')return run(()=>api('/games/'+selected+'/judge-submit',{...b,matchupId:snapshot.event.activeMatchupId}),'Judge choice saved.');
    if(action==='publish'){
      b.expectedRevision=Number(b.expectedRevision);
      if(!confirm(`${b.expectedRevision?'Correct the result to':'Publish'} ${entry(b.winnerEntryId)}? This updates everyone’s standings.`))return;
      return run(()=>api('/admin/games/'+selected+'/publish-outcome',b),'Result published. Everyone’s standings now use this result.');
    }
  });
  const timer=setInterval(async()=>{
    if(busy||polling||disposed||!connected)return;polling=true;const version=generation;
    try{await read(false,version);}catch{if(version===generation){connected=false;say('Connection interrupted. Refresh before controlling the event.');}}finally{polling=false;if(!disposed)disable();}
  },3000);
  draw();
  run(async()=>{},'Up to date.');
  return ()=>{disposed=true;clearInterval(timer);};
}
