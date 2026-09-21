import {WORLDS} from '/shared/domain.mjs';

const h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const presets={everyday:[0,1,2,3,4,5,6],weekdays:[1,2,3,4,5],weekends:[0,6]};
const sameDays=(a,b)=>a.length===b.length&&a.every(d=>b.includes(d));
const dayLabel=days=>sameDays(days,presets.everyday)?'Every day':sameDays(days,presets.weekdays)?'Weekdays':sameDays(days,presets.weekends)?'Weekends':days.length?[1,2,3,4,5,6,0].filter(d=>days.includes(d)).map(d=>weekdays[d].slice(0,3)).join(', '):'Choose at least one day';
const mixLabel=mix=>Object.keys(mix.worlds).map(id=>WORLDS.find(w=>w.id===id)?.name||id).join(' + ');
function clock(value){if(!/^\d{2}:\d{2}$/.test(value))return '—';const [hour,minute]=value.split(':').map(Number);return `${hour%12||12}${minute?':'+String(minute).padStart(2,'0'):''} ${hour<12?'AM':'PM'}`;}
const timeLabel=(start,end)=>`${clock(start)} – ${clock(end)}${end<start?' · ends next day':''}`;
const zoneLabel=venue=>`${venue.timezone.split('/').at(-1).replaceAll('_',' ')} time`;
const targetLabel=row=>row?.tv_ids.length?`${row.tv_ids.length} selected TV${row.tv_ids.length===1?'':'s'}`:'All TVs';

export function schedulePage({venue,rows}){
 return `<header class="header"><div><div class="eyebrow">PROGRAMMING SCHEDULE</div><h1>The right MIXX, right on time.</h1><p>Choose what plays and when. Your TVs take it from there.</p></div>${rows.length?'<button class="btn" type="button" data-action="schedule">+ Add schedule</button>':''}</header>
 <section class="schedule-page" aria-label="Programming schedule">
 ${rows.length?`<div class="schedule-list">${rows.map(row=>`<article class="schedule-card"><div class="schedule-card-days"><span class="eyebrow">${h(dayLabel(row.days))}</span><strong>${h(timeLabel(row.start_time,row.end_time))}</strong></div><div class="schedule-card-content"><h2>${h(row.name)}</h2><p>${h(mixLabel(row.mix))}</p><small>${h(targetLabel(row))}${row.active?'':' · Inactive'}</small></div><div class="schedule-card-actions"><button type="button" class="btn secondary" data-action="schedule" data-id="${h(row.id)}" aria-label="Edit ${h(row.name)}">Edit</button><button type="button" class="btn ghost small" data-action="remove-schedule" data-id="${h(row.id)}" aria-label="Remove ${h(row.name)}">Remove</button></div></article>`).join('')}</div>`:
 `<div class="schedule-empty"><span class="eyebrow">SET IT ONCE</span><h2>A little planning.<br>A room that runs itself.</h2><p>Golf in the afternoon. Bourbon in the evening.<br>Set your programming to match your day.</p><button class="btn" type="button" data-action="schedule">Create your first schedule</button><div class="schedule-example"><span>EXAMPLE</span><strong>Bourbon</strong><p>Weekdays · 6–9 PM · All TVs</p></div><small>Scheduling is optional. Keep using your TV remote whenever you need it.</small></div>`}
 <div class="schedule-notes"><p>Times use <strong title="${h(venue.timezone)}">${h(zoneLabel(venue))}</strong>. If schedules overlap, the most recently created one takes priority.</p><p>When a time slot ends, TVs return to their saved programming. Billboard dates stay in My Billboard.</p></div>
 </section>`;
}

export function openScheduleEditor({dialog,modal,api,venue,currentMix,rows,id,onSaved}){
 const row=id?rows.find(r=>r.id===id):null;
 if(id&&!row)throw Error('That schedule is no longer available. Refresh and try again.');
 const source=row?.mix||currentMix;
 const days=row?.days||presets.everyday;
 const selected=Object.keys(source.worlds);
 modal(row?'Edit schedule':'What plays, and when?',`<form data-schedule-editor><div class="schedule-form-body">
  <fieldset class="schedule-step"><legend><span>1</span> What plays?</legend><div class="schedule-worlds">${WORLDS.map(w=>`<label class="schedule-choice"><input type="checkbox" name="world" value="${w.id}" ${selected.includes(w.id)?'checked':''}><span>${h(w.name)}</span></label>`).join('')}</div><p class="small">Choose one, or combine a few.</p></fieldset>
  <fieldset class="schedule-step"><legend><span>2</span> Which days?</legend><div class="schedule-presets" role="group" aria-label="Day presets">${Object.entries(presets).map(([key,value])=>`<button class="btn secondary small" type="button" data-schedule-days="${key}" aria-pressed="${sameDays(days,value)}">${key==='everyday'?'Every day':key==='weekdays'?'Weekdays':'Weekends'}</button>`).join('')}</div><div class="schedule-days">${[1,2,3,4,5,6,0].map(d=>`<label class="schedule-choice"><input type="checkbox" name="day" value="${d}" aria-label="${weekdays[d]}" ${days.includes(d)?'checked':''}><span>${weekdays[d].slice(0,3)}</span></label>`).join('')}</div></fieldset>
  <fieldset class="schedule-step"><legend><span>3</span> What time?</legend><div class="schedule-times"><label class="field"><span class="label">Start</span><input name="start" type="time" required value="${h(row?.start_time||'18:00')}"></label><label class="field"><span class="label">End</span><input name="end" type="time" required value="${h(row?.end_time||'21:00')}"></label></div><p class="small">${h(zoneLabel(venue))} · ${h(targetLabel(row))}</p></fieldset>
  <label class="field schedule-name"><span class="label">Give it a name <small>(optional)</small></span><input name="name" maxlength="80" placeholder="e.g. Friday evenings" value="${h(row?.name||'')}"></label>
  <div class="schedule-summary" role="status" aria-live="polite"><span class="eyebrow">THIS WILL PLAY</span><strong data-schedule-summary></strong><p data-schedule-time></p></div>
  </div><p class="form-error" role="alert"></p><div class="dialog-actions"><button class="btn secondary" type="button" data-action="close">Cancel</button><button class="btn" type="submit">${row?'Save changes':'Save schedule'}</button></div>
 </form>`);
 dialog.classList.add('schedule-dialog');
 const controller=new AbortController(),options={signal:controller.signal};
 const form=dialog.querySelector('[data-schedule-editor]');
 let busy=false;
 const update=()=>{
  const fd=new FormData(form),worlds=fd.getAll('world'),days=fd.getAll('day').map(Number);
  form.querySelector('[data-schedule-summary]').textContent=worlds.length?worlds.map(id=>WORLDS.find(w=>w.id===id).name).join(' + '):'Choose some programming';
  form.querySelector('[data-schedule-time]').textContent=`${dayLabel(days)} · ${timeLabel(fd.get('start'),fd.get('end'))} · ${targetLabel(row)}`;
  for(const button of form.querySelectorAll('[data-schedule-days]'))button.setAttribute('aria-pressed',String(sameDays(days,presets[button.dataset.scheduleDays])));
 };
 form.addEventListener('input',update,options);
 form.addEventListener('click',event=>{const button=event.target.closest('[data-schedule-days]');if(!button||busy)return;for(const input of form.querySelectorAll('[name="day"]'))input.checked=presets[button.dataset.scheduleDays].includes(Number(input.value));update();},options);
 dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();},options);
 dialog.addEventListener('close',()=>{dialog.classList.remove('schedule-dialog');controller.abort();},{once:true});
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;
  const fd=new FormData(form),worlds=fd.getAll('world'),days=fd.getAll('day').map(Number),error=form.querySelector('.form-error');
  error.textContent='';
  if(!worlds.length){error.textContent='Choose at least one kind of programming.';return;}
  if(!days.length){error.textContent='Choose at least one day.';return;}
  if(fd.get('start')===fd.get('end')){error.textContent='Choose different start and end times.';return;}
  const mix={...source,mode:worlds.length===1?'single':'blend',worlds:Object.fromEntries(worlds.map(id=>[id,source.worlds[id]||'normal'])),subcategories:Object.fromEntries(Object.entries(source.subcategories||{}).filter(([id])=>worlds.includes(id)))};
  const body={name:fd.get('name').trim()||`${mixLabel(mix)} · ${dayLabel(days)}`.slice(0,80),mix,days,start:fd.get('start'),end:fd.get('end'),tvIds:row?.tv_ids||[],theme:row?.theme||venue.theme};
  busy=true;for(const control of dialog.querySelectorAll('button,input'))control.disabled=true;
  try{
   await api('/schedules'+(row?'/'+encodeURIComponent(row.id):''),body,row?'PATCH':'POST');
   dialog.close();await onSaved();
  }catch(e){error.textContent=e.message||'Could not save. Check your connection and try again.';}
  finally{busy=false;for(const control of dialog.querySelectorAll('button,input'))control.disabled=false;}
 },options);
 update();
}
