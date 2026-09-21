const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function billboardPage(){return `<header class="header"><div><div class="eyebrow">YOUR VENUE / YOUR MESSAGE</div><h1>My Billboard.</h1><p>Create something worth noticing beside a portrait short.</p></div></header><section data-billboards><div class="bb-status" role="status" aria-live="polite" data-bb-status>Opening your billboards…</div><div data-bb-content></div></section>`;}
export function mountBillboards({root,api}){
 let data=null,current=null,dirty=false,busy=false,writing=false,disposed=false,needsReload=false;const controllers=new Set();
 const $=selector=>root.querySelector(selector),say=message=>{if(!disposed)$('[data-bb-status]').textContent=message;};
 async function request(path,body,method=body===undefined?'GET':'POST'){const controller=new AbortController();controllers.add(controller);const timer=setTimeout(()=>controller.abort(),15000);writing=method!=='GET';try{return await api(path,body,method,{signal:controller.signal});}finally{writing=false;clearTimeout(timer);controllers.delete(controller);}}
 function controls(){
  if(disposed||!data)return;
  for(const el of root.querySelectorAll('input,textarea,select,[data-bb-template],[data-bb-save]'))el.disabled=busy||!data.canEdit||needsReload;
  for(const el of root.querySelectorAll('[data-bb-open]'))el.disabled=busy||needsReload;
  $('[data-bb-new]').disabled=busy||needsReload||!data.canEdit;
  $('[data-bb-refresh]').disabled=busy;
  $('[data-bb-publish]').disabled=busy||!data.canEdit||needsReload||dirty||!current?.revision;
  $('[data-bb-withdraw]').disabled=busy||!data.canEdit||needsReload||!['published','scheduled'].includes(current?.status);
  $('[data-bb-next]').textContent=!data.canEdit?'View only. A venue owner or manager can edit and publish.':needsReload?'Refresh saved drafts before continuing.':busy?'Updating your billboard…':dirty||!current?.revision?'Save your draft first. Then publish when the preview looks right.':'Ready to publish. Your TVs update at their next check-in.';
 }
 const date=n=>new Intl.DateTimeFormat(undefined,{timeZone:data.timeZone,dateStyle:'medium',timeStyle:'short'}).format(n);
 const localDate=value=>{const parsed=new Date(value+'Z');return Number.isFinite(parsed.getTime())?new Intl.DateTimeFormat(undefined,{timeZone:'UTC',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(parsed):'Choose a time';};
 function preview(){
  if(!current)return;
  $('[data-bb-preview-title]').textContent=$('[name="title"]').value||'Your headline.';
  $('[data-bb-preview-description]').textContent=$('[name="description"]').value||'Your message goes here.';
  $('[data-bb-preview-qr]').hidden=!$('[name="qrUrl"]').value.trim();
  $('[data-bb-draft-label]').textContent=dirty?'Unsaved changes':current.revision?'Saved draft':'New draft';
  $('[data-bb-options-summary]').textContent=($('[name="groupName"]').value||'All TVs')+' · '+localDate($('[name="startsLocal"]').value)+' → '+localDate($('[name="endsLocal"]').value);
  for(const button of root.querySelectorAll('[data-bb-template]'))button.setAttribute('aria-pressed',String(button.dataset.bbTemplate===current.templateId));
  controls();
 }
 function list(){
  $('[data-bb-count]').textContent=data.billboards.length;
  $('[data-bb-list]').innerHTML=data.billboards.length?data.billboards.map(row=>`<button type="button" class="bb-saved ${row.id===current?.id?'selected':''}" data-bb-open="${h(row.id)}"><span><strong>${h(row.title)}</strong><small>${h(row.groupName||'All venue TVs')} · ${h(row.status)}${row.publishedRevision&&row.revision>row.publishedRevision?' · draft changes':''}</small></span><span aria-hidden="true">→</span></button>`).join(''):'<p class="small">Your saved billboards will appear here.</p>';
 }
 function fill(row){
  current=row||{id:crypto.randomUUID(),revision:0,title:'',description:'',qrUrl:'',templateId:'',groupName:'',...data.defaults,status:'draft'};dirty=false;needsReload=false;
  for(const name of ['title','description','qrUrl','groupName','startsLocal','endsLocal'])$(`[name="${name}"]`).value=current[name]||'';
  if(current.groupName&&![...$('[name="groupName"]').options].some(option=>option.value===current.groupName)){const option=document.createElement('option');option.value=current.groupName;option.textContent=current.groupName+' · group no longer available';$('[name="groupName"]').append(option);$('[name="groupName"]').value=current.groupName;}
  const p=current.published;$('[data-bb-publication]').textContent=p&&['published','scheduled','expired'].includes(current.status)?`${current.status==='expired'?'Previous publication':'Published version'}: ${p.title} · ${p.groupName||'All venue TVs'} · ${date(p.startsAt)} – ${date(p.endsAt)} (${data.timeZone}).`:'This draft is not published.';
  list();preview();$('[data-bb-draft-label]').textContent=current.revision?'Saved draft':'New draft';
 }
 function draw(){
  $('[data-bb-content]').innerHTML=`<div class="bb-toolbar"><p class="small">${h(data.venueName)}</p><div class="actions"><button type="button" class="btn secondary small" data-bb-refresh>Refresh drafts</button><button type="button" class="btn small" data-bb-new>New billboard</button></div></div>
   <section class="bb-start"><div class="section-head"><div><span class="eyebrow">1 · CHOOSE A STARTING POINT</span><h2>A good message starts here.</h2></div><small>Or write your own below.</small></div><div class="bb-templates">${data.templates.map(t=>`<button type="button" data-bb-template="${h(t.id)}" aria-pressed="false"><small>${h(t.label)}</small><strong>${h(t.name)}</strong><span>${h(t.title)}</span></button>`).join('')}</div></section>
   <div class="bb-workspace"><section class="panel bb-editor"><div class="section-head"><div><div class="eyebrow">2 · MAKE IT YOURS</div><h2>What’s your message?</h2></div><span class="badge" data-bb-draft-label>New draft</span></div>
   <form data-bb-form><label class="field"><span class="label">Headline</span><input name="title" required maxlength="70" placeholder="Your next great discovery."></label><label class="field"><span class="label">Message</span><textarea name="description" required maxlength="160" rows="3" placeholder="A store pick, an upcoming tasting, a reason to ask your team."></textarea></label>
   <details class="bb-options" data-bb-options><summary><strong>Where, when & QR link</strong><span data-bb-options-summary></span></summary><div class="bb-options-fields"><label class="field"><span class="label" id="bb-group-label">TV group</span><select name="groupName" aria-labelledby="bb-group-label"><option value="">All venue TVs</option>${data.groups.map(g=>`<option value="${h(g)}">${h(g)}</option>`).join('')}</select></label><div class="grid cols2"><label class="field"><span class="label">Starts</span><input name="startsLocal" type="datetime-local" required></label><label class="field"><span class="label">Ends</span><input name="endsLocal" type="datetime-local" required></label></div><p class="small">Times use ${h(data.timeZone.split('/').at(-1).replaceAll('_',' '))} time.</p><label class="field"><span class="label" id="bb-qr-label">QR destination · optional</span><input aria-labelledby="bb-qr-label" aria-describedby="bb-qr-help" name="qrUrl" type="url" maxlength="1800" placeholder="https://your-store.com/event"><small id="bb-qr-help">Open your website from the TV. Use an HTTPS link. Visits and sales are not tracked here.</small></label></div></details>
   <div class="actions section"><button type="submit" class="btn secondary" data-bb-save>Save draft</button><button type="button" class="btn ghost" data-bb-see>See preview →</button></div></form></section>
   <section class="panel bb-preview-panel" tabindex="-1" aria-label="Billboard TV preview"><div class="section-head"><div><div class="eyebrow">3 · PREVIEW & PUBLISH</div><h2>Picture it on your TV.</h2></div><small>Design preview · sample short</small></div><div class="bb-tv"><div class="bb-short"><span>MIXXWAVE / SHORTS</span><div class="bb-glass" aria-hidden="true"></div><p>Stories worth<br>staying for.</p></div><div class="bb-preview-ad"><span>${h(data.venueName)}</span><h3 data-bb-preview-title></h3><p data-bb-preview-description></p><div class="bb-preview-qr" data-bb-preview-qr hidden><b>QR</b><span>Your link<small>The scannable code appears after publication.</small></span></div></div></div>
   <p class="bb-next" data-bb-next></p><div class="actions"><button type="button" class="btn" data-bb-publish>Publish billboard</button><button type="button" class="btn ghost small" data-bb-withdraw>Withdraw</button></div><p class="small bb-publication" data-bb-publication></p><details class="bb-help"><summary>When will this appear?</summary><p class="small">Shown beside portrait videos, or below them on vertical TVs. Landscape videos stay full screen. Clean Screen hides billboards. Your TV’s promotion and QR settings still apply.</p></details></section></div>
   <details class="panel section bb-library"><summary>Your saved billboards (<span data-bb-count>${data.billboards.length}</span>)</summary><div data-bb-list></div></details>
   ${data.legacyPromotions?.length?`<details class="panel section"><summary>Earlier venue promotions</summary>${data.legacyPromotions.map(p=>`<div class="list-row"><div><strong>${h(p.title)}</strong><p class="small">${h(p.description)}</p></div><button type="button" class="btn secondary small" data-bb-legacy="${h(p.id)}" ${!data.canEdit?'disabled':''}>Stop promotion</button></div>`).join('')}</details>`:''}
   <details class="panel section"><summary>Sponsor placements</summary><p class="small section">You can publish your own promotions and MIXXWAVE house templates now. Paid sponsor placements and revenue sharing are not available yet.</p></details>`;
  fill(current&&data.billboards.find(row=>row.id===current.id)||data.billboards[0]);
 }
 async function reload(){data=await request('/billboards');if(disposed)return;draw();say(data.canEdit?'Drafts are up to date. Save first, then publish when ready.':'Your venue role can preview billboards. Ask a manager to edit or publish.');}
 async function run(action){if(busy||disposed)return;busy=true;controls();try{await action();}catch(error){if(disposed)return;needsReload=!error.status||error.status===409;if(error.status===400)$('[data-bb-options]').open=true;say(error.status?error.message:'Connection interrupted. Reload saved drafts to check whether your last action completed before trying again.');}finally{busy=false;if(!disposed)controls();}}
 function replace(row){current=row;data.billboards=[row,...data.billboards.filter(b=>b.id!==row.id)];fill(row);}
 const discard=()=>!dirty||confirm('Discard your unsaved billboard changes?');
 const beforeUnload=event=>{if(dirty||writing){event.preventDefault();event.returnValue='';}};
 window.addEventListener('beforeunload',beforeUnload);
 root.addEventListener('invalid',event=>{event.target.closest('details')?.setAttribute('open','');},true);
 const edited=event=>{if(event.target.closest('[data-bb-form]')){if(!dirty)say('Unsaved changes. Save your draft before publishing.');dirty=true;preview();}};
 root.addEventListener('input',edited);
 root.addEventListener('change',edited);
 root.addEventListener('submit',event=>{if(!event.target.matches('[data-bb-form]'))return;event.preventDefault();if(!data?.canEdit||needsReload||busy)return;const body={...Object.fromEntries(new FormData(event.target)),templateId:current.templateId,expectedRevision:current.revision};run(async()=>{const result=await request('/billboards/'+current.id,body);if(disposed)return;replace(result.billboard);say('Draft saved. Your published version has not changed.');});});
 root.addEventListener('click',event=>{
  const el=event.target.closest('button');if(!el||busy||el.disabled)return;
  if(el.hasAttribute('data-bb-see')){$('.bb-preview-panel').scrollIntoView({behavior:'smooth',block:'start'});$('.bb-preview-panel').focus({preventScroll:true});return;}
  if(el.dataset.bbLegacy){if(discard())run(async()=>{await request('/promotions/'+el.dataset.bbLegacy,{},'DELETE');if(!disposed)await reload();});return;}
  if(el.hasAttribute('data-bb-refresh')){if(discard())run(reload);return;}
  if(el.hasAttribute('data-bb-new')){if(discard())fill(null);return;}
  if(el.dataset.bbOpen){if(discard())fill(data.billboards.find(b=>b.id===el.dataset.bbOpen));return;}
  if(el.dataset.bbTemplate){const template=data.templates.find(t=>t.id===el.dataset.bbTemplate);current.templateId=template.id;$('[name="title"]').value=template.title;$('[name="description"]').value=template.description;dirty=true;preview();say('Template applied to this draft. Edit it, then save.');return;}
  if(el.hasAttribute('data-bb-publish')){if(!confirm(`Publish “${current.title}” to ${current.groupName||'all venue TVs'} from ${date(current.startsAt)} to ${date(current.endsAt)} (${data.timeZone})?`))return;run(async()=>{const r=await request('/billboards/'+current.id+'/publish',{expectedRevision:current.revision});if(disposed)return;replace(r.billboard);say('Billboard published for its scheduled window. Connected TVs update at their next check-in.');});}
  if(el.hasAttribute('data-bb-withdraw')){if(!confirm('Withdraw the published billboard? Your saved draft will remain.'))return;run(async()=>{const r=await request('/billboards/'+current.id+'/withdraw',{expectedRevision:current.revision});if(disposed)return;replace(r.billboard);say('Billboard withdrawn. Connected TVs remove it at their next check-in; disconnected displays expire it within 15 seconds.');});}
 });
 run(reload);const dispose=()=>{disposed=true;window.removeEventListener('beforeunload',beforeUnload);for(const controller of controllers)controller.abort();};dispose.canLeave=()=>{if(writing){say('Finishing your update. Please wait before leaving.');return false;}return discard();};return dispose;
}
