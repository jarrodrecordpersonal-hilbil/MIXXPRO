/** MIXXWAVE presentation polish, public Google sign-in and venue catalog browser. */
const replacements=new Map([
  ['MIXXPRO','MIXXWAVE'],
  ['MIXXTANK for venues','MIXXWAVE for venues'],
  ['MIXXTANK Admin','MIXXWAVE Admin'],
  ['MIXXTANK','MIXXWAVE']
]);
let googleStatus=null,catalogCache=null;
async function googleReady(){
  if(googleStatus!==null)return googleStatus;
  try{const r=await fetch('/api/config',{credentials:'same-origin'});googleStatus=r.ok&&!!(await r.json()).googleReady;}catch{googleStatus=false;}
  return googleStatus;
}
function replaceVisibleText(root=document.getElementById('app')){
  if(!root)return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(node){return node.parentElement?.closest('script,style,svg')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT;}});
  const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){let value=node.nodeValue;for(const [from,to] of replacements)value=value.replaceAll(from,to);if(value!==node.nodeValue)node.nodeValue=value;}
}
function go(page){if(page==='mixdata'){location.href='/screens';return;}document.querySelector(`nav [data-page="${page}"]`)?.click();}
function launchpad(){
  const main=document.querySelector('.main'),crumb=document.querySelector('.breadcrumb');
  if(!main||!crumb||!/^Your workspace\s*\/\s*Home\s*$/i.test(crumb.textContent.trim())||main.querySelector('.mixxwave-launchpad'))return;
  const connected=!document.body.textContent.includes('Connect your first TV')&&!document.body.textContent.includes('Pair a TV');
  const panel=document.createElement('section');panel.className='mixxwave-launchpad';panel.setAttribute('aria-label','Quick setup');
  panel.innerHTML=`<div class="mixxwave-launchpad-head"><div><div class="eyebrow">QUICK SETUP</div><h2>Get the room playing.</h2><p>Four simple moves. You can change any of them later.</p></div><span class="badge ${connected?'':'off'}">${connected?'TV connected':'Start here'}</span></div><div class="mixxwave-launchpad-grid"><button type="button" data-go="mixx"><b>1. Choose the MIXX</b><span>Golf, bourbon, travel, cigar, food—or blend them.</span></button><button type="button" data-go="themes"><b>2. Pick the look</b><span>Choose the visual theme that fits the room.</span></button><button type="button" data-go="tvs"><b>3. Connect the TV</b><span>${connected?'Manage the paired screens and remote.':'Pair a screen with the six-digit code.'}</span></button><button type="button" data-go="mixdata"><b>4. Open MIXDATA</b><span>See what played, where, and for how long.</span></button></div>`;
  main.querySelector('.topbar')?.insertAdjacentElement('afterend',panel);panel.addEventListener('click',e=>{const button=e.target.closest('[data-go]');if(button)go(button.dataset.go);});
}
async function googleButton(){
  if(!(await googleReady()))return;
  for(const form of document.querySelectorAll('form')){
    if(form.querySelector('.mixxwave-google')||!form.querySelector('input[type="email"]'))continue;
    const link=document.createElement('a');link.className='mixxwave-google';link.href='/api/auth/google';link.innerHTML='<span class="g-mark" aria-hidden="true">G</span><span>Continue with Google</span>';
    const divider=document.createElement('div');divider.className='mixxwave-divider';divider.textContent='or';
    form.prepend(divider);form.prepend(link);
  }
}
async function loadCatalog(){
  if(catalogCache)return catalogCache;
  const venueId=localStorage.getItem('mixx-venue')||'';
  const r=await fetch('/api/catalog',{credentials:'same-origin',headers:{'X-Venue-Id':venueId}});if(!r.ok)throw Error('Catalog unavailable');
  return catalogCache=await r.json();
}
function catalogCard(item,worlds){
  const names=(item.worlds||[]).map(id=>worlds.find(w=>w.id===id)?.name||id),mins=Math.max(1,Math.round((item.duration||0)/60));
  const details=(item.tags||[]).slice(0,3).join(' · ')||'Eligible MIXXWAVE programming';
  return `<article class="mixxwave-video-card" data-title="${String(item.title||'').toLowerCase()}" data-worlds="${(item.worlds||[]).join(' ')}"><div class="mixxwave-video-art"><span>${names[0]||'MIXXWAVE'}</span><strong>▶</strong></div><div class="mixxwave-video-copy"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(details)}</p><small>${escapeHtml(names.join(' · ')||'All programming')} · ${mins} min${item.sponsor?' · Sponsored':''}</small></div></article>`;
}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function openCatalog(){
  let data;try{data=await loadCatalog();}catch{return;}
  let overlay=document.querySelector('.mixxwave-catalog-overlay');if(overlay)overlay.remove();
  overlay=document.createElement('div');overlay.className='mixxwave-catalog-overlay';
  const filters=data.worlds.map(w=>`<button type="button" data-world="${w.id}">${escapeHtml(w.name)}</button>`).join('');
  overlay.innerHTML=`<section class="mixxwave-catalog" role="dialog" aria-modal="true" aria-label="Browse videos"><div class="mixxwave-catalog-head"><div><div class="eyebrow">MIXXWAVE LIBRARY</div><h2>Browse available videos</h2><p>These are published videos currently eligible for your venue plan.</p></div><button type="button" class="mixxwave-close" aria-label="Close">×</button></div><div class="mixxwave-catalog-tools"><input type="search" placeholder="Search videos" aria-label="Search videos"><div class="mixxwave-catalog-filters"><button type="button" data-world="" class="active">All</button>${filters}</div></div><div class="mixxwave-video-grid">${data.content.length?data.content.map(v=>catalogCard(v,data.worlds)).join(''):'<div class="mixxwave-catalog-empty"><h3>No published videos yet.</h3><p>Your Bunny videos need to be imported, categorized, rights-confirmed and published in MIXXWAVE Admin before venues can see them here.</p></div>'}</div><p class="mixxwave-catalog-note">Browsing does not change what is playing. Your saved MIXX controls the rotation.</p></section>`;
  document.body.append(overlay);
  const filter=()=>{const q=overlay.querySelector('input').value.trim().toLowerCase(),world=overlay.querySelector('.mixxwave-catalog-filters .active')?.dataset.world||'';for(const card of overlay.querySelectorAll('.mixxwave-video-card'))card.hidden=!!q&&!card.dataset.title.includes(q)||!!world&&!card.dataset.worlds.split(' ').includes(world);};
  overlay.querySelector('input').addEventListener('input',filter);overlay.querySelector('.mixxwave-close').onclick=()=>overlay.remove();overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();const b=e.target.closest('[data-world]');if(b){for(const x of overlay.querySelectorAll('.mixxwave-catalog-filters button'))x.classList.remove('active');b.classList.add('active');filter();}});
}
function catalogButton(){
  const main=document.querySelector('.main'),crumb=document.querySelector('.breadcrumb');if(!main||!crumb||!/^Your workspace\s*\/\s*Home\s*$/i.test(crumb.textContent.trim())||main.querySelector('.mixxwave-catalog-entry'))return;
  const section=document.createElement('section');section.className='mixxwave-catalog-entry';section.innerHTML='<div><div class="eyebrow">PROGRAMMING LIBRARY</div><h2>See what MIXXWAVE can play.</h2><p>Browse the published videos available to your venue.</p></div><button type="button" class="btn secondary">Browse videos →</button>';
  const anchor=main.querySelector('.mixxwave-launchpad');anchor?.insertAdjacentElement('afterend',section);section.querySelector('button').onclick=openCatalog;
}
function polish(){document.title='MIXXWAVE · Your room. Your MIXX.';replaceVisibleText();launchpad();catalogButton();googleButton();}
if(!document.getElementById('mixxwave-polish-style')){
  const style=document.createElement('style');style.id='mixxwave-polish-style';style.textContent=`.mixxwave-launchpad{margin:-9px 0 18px;padding:20px 22px;border:1px solid #d8ded1;border-radius:16px;background:linear-gradient(135deg,#fffefa,#edf1e7);box-shadow:0 12px 32px #23332908}.mixxwave-launchpad-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:15px}.mixxwave-launchpad-head p{font-size:12px;margin-top:4px}.mixxwave-launchpad-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.mixxwave-launchpad-grid button{min-height:104px;border:1px solid #d9dfd2;border-radius:12px;background:#fffefa;text-align:left;padding:15px;color:#29382c;transition:transform .15s,box-shadow .15s,border-color .15s}.mixxwave-launchpad-grid button:hover{transform:translateY(-2px);border-color:#aebca8;box-shadow:0 7px 16px #2434290b}.mixxwave-launchpad-grid b{display:block;font-size:12px;margin-bottom:7px}.mixxwave-launchpad-grid span{display:block;font-size:11px;line-height:1.45;color:#697269}.mixxwave-catalog-entry{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:18px 22px;margin:0 0 28px;border:1px solid #d9ded5;border-radius:14px;background:#fffefa}.mixxwave-catalog-entry p{font-size:12px;margin-top:3px}.mixxwave-catalog-overlay{position:fixed;inset:0;z-index:1000;background:#101612cc;display:grid;place-items:center;padding:24px}.mixxwave-catalog{width:min(1180px,100%);max-height:90vh;overflow:auto;background:#f7f6f1;border-radius:18px;padding:26px;box-shadow:0 30px 90px #0008}.mixxwave-catalog-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.mixxwave-close{font-size:29px;line-height:1;background:none;color:#4f5a51}.mixxwave-catalog-tools{display:grid;gap:10px;margin:20px 0}.mixxwave-catalog-tools input{max-width:430px}.mixxwave-catalog-filters{display:flex;gap:7px;flex-wrap:wrap}.mixxwave-catalog-filters button{border:1px solid #d3d9cf;border-radius:999px;background:#fffefa;padding:7px 11px;font-size:11px;color:#506056}.mixxwave-catalog-filters button.active{background:#dfe8da;color:#29452f}.mixxwave-video-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.mixxwave-video-card{background:#fffefa;border:1px solid #dde1d9;border-radius:13px;overflow:hidden}.mixxwave-video-art{aspect-ratio:16/9;background:linear-gradient(145deg,#1b2c24,#476351);display:flex;align-items:flex-end;justify-content:space-between;padding:16px;color:#f2eee3}.mixxwave-video-art span{font-size:10px;letter-spacing:1.4px;text-transform:uppercase}.mixxwave-video-art strong{font-size:20px}.mixxwave-video-copy{padding:13px}.mixxwave-video-copy h3{font-size:13px}.mixxwave-video-copy p{font-size:11px;min-height:34px;margin:5px 0}.mixxwave-video-copy small{font-size:10px}.mixxwave-catalog-empty{grid-column:1/-1;padding:45px;border:1px dashed #ccd3c8;border-radius:14px;text-align:center}.mixxwave-catalog-note{font-size:10px;margin-top:16px}.mixxwave-google{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:45px;margin:0 0 14px;border:1px solid #cbd2c8;border-radius:10px;background:#fff;color:#26352b;text-decoration:none;font-size:13px;font-weight:650}.mixxwave-google:hover{background:#f7f8f4}.g-mark{display:grid;place-items:center;width:22px;height:22px;border:1px solid #d2d6d0;border-radius:50%;font-weight:750;font-family:Arial,sans-serif}.mixxwave-divider{display:flex;align-items:center;gap:10px;margin:2px 0 14px;color:#8a9189;font-size:10px;text-transform:uppercase;letter-spacing:1px}.mixxwave-divider:before,.mixxwave-divider:after{content:"";height:1px;background:#e1e4de;flex:1}@media(max-width:900px){.mixxwave-launchpad-grid,.mixxwave-video-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:520px){.mixxwave-launchpad{padding:17px}.mixxwave-launchpad-grid,.mixxwave-video-grid{grid-template-columns:1fr}.mixxwave-launchpad-grid button{min-height:auto}.mixxwave-launchpad-head .badge{display:none}.mixxwave-catalog-entry{align-items:flex-start;flex-direction:column}.mixxwave-catalog-overlay{padding:8px}.mixxwave-catalog{padding:18px;max-height:96vh}}`;document.head.append(style);
}
const app=document.getElementById('app');if(app)new MutationObserver(()=>queueMicrotask(polish)).observe(app,{childList:true,subtree:true});polish();
