import {WORLDS,THEMES} from '/shared/domain.mjs';
const h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const options=(items,value)=>items.map(([key,label])=>`<option value="${h(key)}" ${key===value?'selected':''}>${h(label)}</option>`).join('');
export function environmentPanel(environments){
  return `<section class="section panel" data-curator-environments><div class="section-head"><div><h2>Curated environments</h2><p class="small">Create the programming your venues can choose.</p></div><button class="btn secondary" data-action="edit-environment">Create environment</button></div>${environments.length?environments.map(e=>`<article class="list-row"><div><b>${h(e.name)}</b><p>${h(e.description)}</p><span class="badge">${h(e.status)} · Version ${e.version}</span></div><button class="btn secondary small" data-action="edit-environment" data-id="${h(e.id)}">Edit / preview</button></article>`).join(''):'<p class="small">Start with a draft, preview its programming, then publish it for venues.</p>'}</section>`;
}
export function openEnvironmentEditor({environment,venues,api,onSaved}){
  const e=environment||{name:'',description:'',mix:{worlds:{golf:'normal'},subcategories:{},minutes:180,seed:1},theme:'modern-luxury',accent:'#c7aa77',playbackMode:'full',showQr:true,showVenuePromotions:true,blockedBrands:[],status:'draft'};
  const dialog=document.createElement('dialog');dialog.className='curator-dialog';dialog.setAttribute('aria-labelledby','curator-title');
  dialog.innerHTML=`<form data-curator-form><header><div><div class="eyebrow">CURATED PROGRAMMING</div><h2 id="curator-title">${e.id?'Edit environment':'Create environment'}</h2><p>${e.status==='published'?'The current version stays live until you publish your update.':'Drafts stay private until published.'}</p></div><button type="button" class="btn secondary small" data-curator-close aria-label="Close environment editor">Close</button></header>
    <label class="field"><span class="label">Environment name</span><input name="name" required maxlength="80" value="${h(e.name)}"></label>
    <label class="field"><span class="label">Description</span><input name="description" maxlength="240" value="${h(e.description)}"></label>
    <fieldset><legend>Programming worlds</legend><p class="small">Choose a world or blend several. Optional topics narrow the selection.</p><div class="curator-worlds">${WORLDS.map(w=>`<div><label class="field"><span class="label">${h(w.name)}</span><select name="world-${w.id}" aria-label="${h(w.name)} programming weight">${options([['','Off'],['less','Less'],['normal','Normal'],['more','More']],e.mix.worlds[w.id]||'')}</select></label><details><summary>${h(w.name)} topics</summary>${w.choices.map(tag=>`<label class="check"><input type="checkbox" name="topics-${w.id}" value="${h(tag)}" ${(e.mix.subcategories?.[w.id]||[]).includes(tag)?'checked':''}>${h(tag)}</label>`).join('')}</details></div>`).join('')}</div></fieldset>
    <div class="grid cols2"><label class="field"><span class="label">Rotation minutes</span><input type="number" name="minutes" min="30" max="360" required value="${e.mix.minutes}"></label><label class="field"><span class="label">TV appearance</span><select name="theme" aria-label="TV appearance">${options(THEMES.map(t=>[t.id,t.name]),e.theme)}</select></label></div>
    <div class="grid cols2"><label class="field"><span class="label">Playback mode</span><select name="playbackMode" aria-label="Playback mode">${options([['full','Full MIXX'],['no-ads','No Ads'],['clean','Clean Screen']],e.playbackMode)}</select></label><label class="field"><span class="label">Accent color</span><input name="accent" type="color" value="${h(/^#[0-9a-f]{6}$/i.test(e.accent)?e.accent:'#c7aa77')}"></label></div>
    <div class="actions"><label class="check"><input name="showQr" type="checkbox" ${e.showQr?'checked':''}>Show QR</label><label class="check"><input name="showVenuePromotions" type="checkbox" ${e.showVenuePromotions?'checked':''}>Show venue promotions</label></div><p class="small">Clean Screen always hides ads, QR codes and venue promotions.</p>
    <label class="field"><span class="label">Blocked advertiser brand IDs, separated by commas</span><input name="blockedBrands" value="${h(e.blockedBrands.join(', '))}"></label>
    <section class="curator-preview"><h3>Preview programming</h3><label class="field"><span class="label">Preview for venue</span><select name="previewVenue" aria-label="Preview for venue">${options(venues.map(v=>[v.id,v.name]),venues[0]?.id)}</select></label><p class="small">Uses this venue's eligible content, ads and promotions. Screen schedules and shuffle settings may change the live order.</p><button type="button" class="btn secondary" data-curator-preview ${venues.length?'':'disabled'}>Preview programming</button><div data-curator-preview-result></div></section>
    <p class="form-error" role="status" aria-live="polite"></p><footer class="actions"><button type="submit" class="btn" name="intent" value="save">${e.status==='published'?'Publish update':'Save draft'}</button>${e.id&&e.status!=='published'?'<button type="submit" class="btn secondary" name="intent" value="publish">Publish environment</button>':''}${e.status==='published'?'<button type="button" class="btn secondary" data-curator-withdraw>Withdraw environment</button>':''}</footer></form>`;
  document.body.append(dialog);dialog.showModal();
  const form=dialog.querySelector('form'),status=dialog.querySelector('[role=status]'),preview=dialog.querySelector('[data-curator-preview-result]');
  let busy=false;
  function payload(){
    const f=new FormData(form),worlds=Object.fromEntries(WORLDS.filter(w=>f.get('world-'+w.id)).map(w=>[w.id,f.get('world-'+w.id)]));
    const subcategories=Object.fromEntries(Object.keys(worlds).map(world=>[world,f.getAll('topics-'+world)]).filter(([,tags])=>tags.length));
    return {name:f.get('name'),description:f.get('description'),mix:{mode:Object.keys(worlds).length===1?'single':'blend',worlds,subcategories,minutes:Number(f.get('minutes')),seed:e.mix.seed},
      theme:f.get('theme'),accent:f.get('accent'),playbackMode:f.get('playbackMode'),showQr:f.has('showQr'),showVenuePromotions:f.has('showVenuePromotions'),blockedBrands:String(f.get('blockedBrands')).split(',').map(v=>v.trim()).filter(Boolean)};
  }
  function clearPreview(){preview.replaceChildren();}
  form.addEventListener('input',clearPreview);
  dialog.addEventListener('close',()=>{clearPreview();dialog.remove();});
  dialog.querySelector('[data-curator-close]').onclick=()=>dialog.close();
  async function run(action){
    if(busy)return;busy=true;status.textContent='';
    const buttons=[...form.querySelectorAll('button')],disabled=buttons.map(b=>b.disabled);buttons.forEach(b=>b.disabled=true);
    try{await action();}catch(error){status.textContent=error.message;}finally{busy=false;buttons.forEach((b,i)=>b.disabled=disabled[i]);}
  }
  dialog.querySelector('[data-curator-preview]').onclick=()=>run(async()=>{
    if(!form.reportValidity())return;
    const request={...payload(),venueId:form.elements.previewVenue.value};
    const result=await api('/admin/environments/preview',request);
    if(JSON.stringify(request)!==JSON.stringify({...payload(),venueId:form.elements.previewVenue.value})){status.textContent='Settings changed. Preview again to see the updated programming.';return;}
    const items=result.items,total=Math.round(items.reduce((sum,item)=>sum+item.playSeconds,0)/60),theme=THEMES.find(t=>t.id===result.theme)||THEMES[0];
    preview.innerHTML=`<p><b>${items.length} clips · ${total} minutes</b> · ${h(result.playbackMode)} · QR ${result.showQr?'on':'off'} · Promotions ${result.showVenuePromotions?'on':'off'}</p><div class="curator-screen" style="--preview-bg:${theme.bg};--preview-accent:${h(/^#[0-9a-f]{6}$/i.test(result.accent)?result.accent:theme.color)}"><div data-curator-media></div><p>${h(result.environmentName)} · ${h(theme.name)}</p></div>${items.length?`<ol>${items.slice(0,24).map((item,index)=>`<li><button type="button" class="btn ghost small" data-curator-clip="${index}">${h(item.title)} · ${item.playSeconds}s${item.campaignId?' · Ad':item.venueCreativeId?' · Venue promotion':''}</button></li>`).join('')}</ol>${items.length>24?'<p class="small">Showing the first 24 clips.</p>':''}`:'<p>No eligible programming for these settings. Adjust the worlds or publish licensed content.</p>'}<p class="small">Preview only. Live screens keep their current programming.</p>`;
    const show=item=>{preview.querySelector('[data-curator-media]').innerHTML=item.venueCreativeId?`<img src="${h(item.url)}" alt="${h(item.title)}">`:`<video controls muted playsinline preload="metadata" src="${h(item.url)}" aria-label="Programming preview"></video>`;};
    if(items.length)show(items[0]);
    preview.querySelectorAll('[data-curator-clip]').forEach(button=>button.onclick=()=>show(items[Number(button.dataset.curatorClip)]));
  });
  form.onsubmit=event=>{event.preventDefault();const publish=e.status==='published'||event.submitter?.value==='publish';run(async()=>{
    if(e.id)await api('/admin/environments/'+e.id,{...payload(),expectedVersion:e.version,publish},'PATCH');
    else await api('/admin/environments',payload());
    await onSaved();dialog.close();
  });};
  const withdraw=dialog.querySelector('[data-curator-withdraw]');
  if(withdraw)withdraw.onclick=()=>run(async()=>{
    await api('/admin/environments/'+e.id+'/withdraw',{expectedVersion:e.version});await onSaved();dialog.close();
  });
}
