const $=selector=>document.querySelector(selector);
const h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DAY=86400000,date=value=>new Date(value).toISOString().slice(0,10);
const when=value=>value?new Date(value).toISOString().replace('T',' ').replace(/\.\d+Z$/,' UTC'):'Not reported';
const duration=value=>`${Number(value||0).toLocaleString('en-US',{maximumFractionDigits:1})} sec`;
let session,venueId='',scope='venue',options,report,filters={},busy=false,rollingWindow=true;
async function api(path,body,method='GET') {
  const r=await fetch('/api'+path,{method,headers:{'X-Venue-Id':venueId,'X-CSRF-Token':session?.csrf||'',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const data=await r.json();if(!r.ok)throw new Error(data.error||'Unable to load MIXDATA.');return data;
}
function message(text,error=false){const el=$('#toast');el.textContent=text;el.className='show'+(error?' error':'');clearTimeout(message.timer);message.timer=setTimeout(()=>el.className='',6500);}
function query(extra={}) {return new URLSearchParams({scope,...filters,...extra}).toString();}
function selection(label,name,values,current){return `<label class="field"><span class="label">${label}</span><select name="${name}">${values.map(([id,title])=>`<option value="${h(id)}" ${id===current?'selected':''}>${h(title)}</option>`).join('')}</select></label>`;}
function input(label,name,value='',type='text'){return `<label class="field"><span class="label">${label}</span><input name="${name}" type="${type}" value="${h(value)}" ${type==='date'?'required':''}></label>`;}
function location(row){const l=row.location;return l?[l.city,l.region,l.country].filter(Boolean).map(h).join(', '):'Location not recorded';}
function rowHtml(row) {return `<tr><td><b>${h(row.title)}</b><small>${row.demo?'<span class="badge demo">Sample film</span> ':''}${h(row.world||'World not recorded')}${row.campaignName?' · '+h(row.campaignName):''}</small></td>
  <td><b>${h(row.venueName)}</b><small>${h(row.tvName)}</small>${!row.metadataSnapshot?'<small>Legacy record: current names</small>':''}</td>
  <td>${location(row)}</td><td>${when(row.firstEventAt)}<small>Last report: ${when(row.lastEventAt)}</small></td>
  <td><b>${duration(row.reportedSeconds)}</b><small>${row.plannedSeconds?duration(row.plannedSeconds)+' programmed':'Programmed duration unknown'}</small></td>
  <td><span class="badge" data-outcome="${h(row.outcome)}">${h(row.outcome)}</span><small>${row.errors} error event${row.errors===1?'':'s'}${row.delayedEvents?' · delayed reports received':''}</small></td>
  <td>${duration(row.cachedSeconds)} cached<small>${duration(row.networkSeconds)} network</small></td></tr>`;}
function render() {
  const summary=report.summary,l=options.location;
  const venueChoices=[['','All venues'],...options.venues.map(v=>[v.id,v.name])];
  $('#app').innerHTML=`<div class="activity-bar"><a class="wordmark" href="/screens" aria-label="MIXDATA"><img src="/icon.svg" alt="">MIX<span>DATA</span></a><a class="btn secondary" href="/">← Back to venue</a></div>
    <header><div class="eyebrow">MIXDATA · SCREEN ANALYTICS</div><h1>Every screen has a story.</h1><p>See what played, where it played, and how many seconds the player reported.</p><p class="summary-note">No estimated eyeballs. No invented dwell time. This is your own screen-playback record.</p></header>
    <div class="scopes">${session.user.role==='admin'?`<button class="btn secondary ${scope==='network'?'active':''}" data-scope="network">Whole network</button>`:''}${session.venues.length?`<button class="btn secondary ${scope==='venue'?'active':''}" data-scope="venue">My venue</button>`:''}${session.user.role==='brand'?`<button class="btn secondary ${scope==='brand'?'active':''}" data-scope="brand">My brand campaigns</button>`:''}</div>
    ${scope==='venue'?`<div class="location-label"><p><b>${h(options.venues[0]?.name||'My venue')}</b> · ${l?[l.city,l.region,l.country].map(h).join(', '):'Add a venue location for future screen reports.'}</p>${options.canEditLocation?'<button class="btn ghost small" data-action="location">Edit venue location</button>':''}</div>`:''}
    <section class="grid cols4"><div class="panel metric"><span class="metric-label">REPORTED SCREEN-HOURS</span><b class="metric-value">${(summary.reportedSeconds/3600).toLocaleString('en-US',{maximumFractionDigits:2})}</b><small>${duration(summary.reportedSeconds)} recorded</small></div>
    <div class="panel metric"><span class="metric-label">SCREENS REPORTING</span><b class="metric-value">${summary.screens.toLocaleString()}</b><small>Across ${summary.venues} venues in this window</small></div>
    <div class="panel metric"><span class="metric-label">PLAYS WITH PROGRESS</span><b class="metric-value">${summary.playsWithProgress.toLocaleString()}</b><small>${summary.recordedPlays} records, including start-only reports</small></div>
    <div class="panel metric"><span class="metric-label">PLAYBACK ERRORS</span><b class="metric-value">${summary.errors.toLocaleString()}</b><small>${summary.skipped} skipped · ${summary.ended} ended</small></div></section>
    <section class="panel section"><form id="filters" class="activity-filters">${input('From · UTC','start',date(report.from),'date')}${input('Through · UTC','end',date(report.to-1),'date')}
    ${scope!=='venue'?selection('Venue','venueId',venueChoices,filters.venueId||''):selection('Screen','tvId',[['','All screens'],...options.tvs.map(t=>[t.id,t.name+(t.revoked?' · disconnected':'')])],filters.tvId||'')}
    ${selection('Channel / world','world',[['','Every world'],...options.worlds.map(w=>[w.id,w.name])],filters.world||'')}
    ${input('Video title','q',filters.q||'')}${input('City · exact match','city',filters.city||'')}${input('State / region · exact match','region',filters.region||'')}
    ${scope!=='venue'?selection('Screen · select a venue first','tvId',[['','All screens'],...options.tvs.map(t=>[t.id,t.name])],filters.tvId||''):'<div></div>'}
    <div class="actions"><button type="submit" class="btn">Show activity</button><button type="button" class="btn secondary" data-action="refresh">Refresh reports</button><span class="small">Up to 31 days at a time. Times shown in UTC.</span></div></form></section>
    <section class="panel section"><div class="activity-bar"><div><h2>What played, and where.</h2><p class="small">${report.total} playback records · latest received ${when(summary.lastReceivedAt)}</p></div><button class="btn secondary small" data-action="export" ${report.rows.length?'':'disabled'}>Export this page · CSV</button></div>
    ${report.rows.length?`<div class="table-wrap section" tabindex="0" aria-label="Playback records. Scroll horizontally for additional columns."><table><thead><tr><th>What played</th><th>Venue / screen</th><th>Where</th><th>First / last report</th><th>Time played</th><th>Outcome</th><th>Playback source</th></tr></thead><tbody>${report.rows.map(rowHtml).join('')}</tbody></table></div>`:
    '<div class="empty section"><h3>No screen reports in this window.</h3><p>Pair a player and play an approved video. Start-only reports do not add screen-hours. Offline activity appears after the player reconnects.</p></div>'}
    <div class="activity-bar page-controls"><span class="small">${report.rows.length?'Showing '+(report.offset+1)+'–'+(report.offset+report.rows.length)+' of '+report.total:'No records'} · Export contains only this page.</span><div class="actions"><button class="btn secondary small" data-action="previous" ${report.offset?'':'disabled'}>Previous</button><button class="btn secondary small" data-action="next" ${report.hasMore?'':'disabled'}>Next</button></div></div></section>
    ${report.geography.length?`<section class="panel section"><h2>Where your content ran.</h2><p class="small">Top 25 recorded locations by reported seconds. These are venue-supplied locations, not device GPS.</p><div class="geo-list">${report.geography.map(g=>`<span><b>${[g.city,g.region,g.country].filter(Boolean).map(h).join(', ')||'Location not recorded'}</b><br>${g.screens} screens · ${(g.reportedSeconds/3600).toFixed(2)} reported hours</span>`).join('')}</div></section>`:''}
    <section class="privacy-note"><h3>Clear about what the data means.</h3><ul class="bullets"><li>A screen report is not proof that a person watched, nor that the physical TV panel was powered on.</li><li>Reported seconds exclude time the player did not report as playing. “Ended” does not certify uninterrupted attention or a full human view.</li><li>Venue location is entered by staff. Old records without a location remain unknown; editing a venue does not rewrite its history.</li><li>Offline reports arrive later. Cache/network source is not a Bunny bandwidth bill. QR visits and orders remain separately attributed to venue, screen, content, and campaign—not assumed human viewing.</li></ul></section>`;
}
async function load(reset=true){
  if(reset){delete filters.asOf;delete filters.offset;if(rollingWindow){delete filters.from;delete filters.to;}}
  options=await api('/screen-activity/options?'+query());
  report=await api('/screen-activity?'+query());
  filters.asOf=String(report.asOf);filters.from=String(report.from);filters.to=String(report.to);
  render();
}
function editLocation(){const l=options.location||{},d=$('#location-dialog');
  d.innerHTML=`<div class="dialog-head"><h2 id="location-title">Where is this venue?</h2><button class="btn ghost small" data-action="close-location" aria-label="Close location form">Close</button></div><p>Only venue-provided information. No location permission or GPS is used.</p><form id="location-form">${input('Street address · optional','address',l.address||'')}${input('City','city',l.city||'')}${input('State / region','region',l.region||'')}${input('Postal code · optional','postalCode',l.postalCode||'')}${input('Country','country',l.country||'')}<p class="small">Saved location appears on newly issued programming. Brand reports show city/region/country, not the street address.</p><div class="form-error" role="alert"></div><div class="actions"><button class="btn" type="submit">Save venue location</button></div></form>`;
  for(const name of ['city','region','country'])d.querySelector(`[name="${name}"]`).required=true;d.showModal();
}
function csv(){
  const cell=value=>'"'+String(value??'').replace(/^[\s]*[=+@-]/,"'$&").replaceAll('"','""')+'"';
  const lines=[['Playback ID','Venue ID','TV ID','Venue','TV','Video ID','Video','World','Campaign ID','Campaign','City','Region','Country','First report UTC','Last report UTC','Reported seconds','Programmed seconds','Outcome','Cached seconds','Network seconds','Delayed events'],
    ...report.rows.map(r=>[r.playbackId,r.venueId,r.tvId,r.venueName,r.tvName,r.contentId,r.title,r.world,r.campaignId,r.campaignName,r.location?.city,r.location?.region,r.location?.country,when(r.firstEventAt),when(r.lastEventAt),r.reportedSeconds,r.plannedSeconds,r.outcome,r.cachedSeconds,r.networkSeconds,r.delayedEvents])];
  const url=URL.createObjectURL(new Blob([lines.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=`MIXDATA-screen-activity-page-${Math.floor(report.offset/report.limit)+1}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
document.addEventListener('click',async event=>{
  const b=event.target.closest('button[data-action],button[data-scope]');if(!b||busy||b.disabled)return;
  if(b.dataset.action==='close-location'){$('#location-dialog').close();return;}
  if(b.dataset.action==='location'){editLocation();return;}
  if(b.dataset.action==='export'){csv();return;}
  busy=true;b.disabled=true;try{
    if(b.dataset.scope){scope=b.dataset.scope;filters={};rollingWindow=true;await load();}
    else if(b.dataset.action==='next'){filters.offset=String(report.offset+report.limit);await load(false);}
    else if(b.dataset.action==='previous'){filters.offset=String(Math.max(0,report.offset-report.limit));await load(false);}
    else await load();
  }catch(error){message(error.message,true);}finally{busy=false;if(b.isConnected)b.disabled=false;}
});
document.addEventListener('change',async event=>{
  if(event.target.name!=='venueId')return;
  try{const v=event.target.value;const next=await api('/screen-activity/options?'+new URLSearchParams({scope,venueId:v}));
    const select=$('[name="tvId"]');select.replaceChildren(new Option('All screens',''),...next.tvs.map(t=>new Option(t.name,t.id)));
  }catch(error){message(error.message,true);}
});
document.addEventListener('submit',async event=>{
  const form=event.target;if(!['filters','location-form'].includes(form.id))return;event.preventDefault();if(busy)return;
  busy=true;const button=form.querySelector('[type="submit"]');button.disabled=true;
  try{const values=Object.fromEntries(new FormData(form));
    if(form.id==='location-form'){const r=await api('/venue/location',values,'PATCH');$('#location-dialog').close();message(r.message);await load();}
    else{const from=Date.parse(values.start+'T00:00:00Z'),to=Date.parse(values.end+'T00:00:00Z')+DAY;
      if(!Number.isFinite(from)||!Number.isFinite(to)||from>=to||to-from>31*DAY)throw Error('Choose a valid window of 31 days or less.');
      const {start,end,...other}=values;rollingWindow=false;filters=Object.fromEntries(Object.entries({...other,from:String(from),to:String(to)}).filter(([,v])=>v));await load();}
  }catch(error){const target=form.querySelector('.form-error');if(target)target.textContent=error.message;message(error.message,true);}
  finally{busy=false;if(button.isConnected)button.disabled=false;}
});
async function start(){session=await api('/session');venueId=localStorage.getItem('mixx-venue')||'';
  if(!session.venues.some(v=>v.id===venueId))venueId=session.venues[0]?.id||'';
  scope=session.user.role==='admin'?'network':session.user.role==='brand'?'brand':'venue';await load();}
start().catch(error=>{$('#app').innerHTML=`<div class="activity-error"><h2>MIXDATA is unavailable.</h2><p>${h(error.message)}</p><a class="btn secondary section" href="/">Return to sign in</a></div>`;});
