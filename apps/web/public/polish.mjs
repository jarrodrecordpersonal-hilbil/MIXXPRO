/** Presentation-only MIXXWAVE polish. No API, billing, DNS or credential changes. */
const replacements=new Map([
  ['MIXXPRO','MIXXWAVE'],
  ['MIXXTANK for venues','MIXXWAVE for venues'],
  ['MIXXTANK Admin','MIXXWAVE Admin'],
  ['MIXXTANK','MIXXWAVE']
]);
function replaceVisibleText(root=document.getElementById('app')){
  if(!root)return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(node){
    return node.parentElement?.closest('script,style,svg')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT;
  }});
  const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){let value=node.nodeValue;for(const [from,to] of replacements)value=value.replaceAll(from,to);if(value!==node.nodeValue)node.nodeValue=value;}
}
function go(page){
  if(page==='mixdata'){location.href='/screens';return;}
  const target=document.querySelector(`nav [data-page="${page}"]`);if(target)target.click();
}
function launchpad(){
  const main=document.querySelector('.main'),crumb=document.querySelector('.breadcrumb');
  if(!main||!crumb||!/^Your workspace\s*\/\s*Home\s*$/i.test(crumb.textContent.trim()))return;
  if(main.querySelector('.mixxwave-launchpad'))return;
  const connected=!document.body.textContent.includes('Connect your first TV')&&!document.body.textContent.includes('Pair a TV');
  const panel=document.createElement('section');panel.className='mixxwave-launchpad';panel.setAttribute('aria-label','Quick setup');
  panel.innerHTML=`<div class="mixxwave-launchpad-head"><div><div class="eyebrow">QUICK SETUP</div><h2>Get the room playing.</h2><p>Four simple moves. You can change any of them later.</p></div><span class="badge ${connected?'':'off'}">${connected?'TV connected':'Start here'}</span></div><div class="mixxwave-launchpad-grid">
    <button type="button" data-go="mixx"><b>1. Choose the MIXX</b><span>Golf, bourbon, travel, cigar, food—or blend them.</span></button>
    <button type="button" data-go="themes"><b>2. Pick the look</b><span>Choose the visual theme that fits the room.</span></button>
    <button type="button" data-go="tvs"><b>3. Connect the TV</b><span>${connected?'Manage the paired screens and remote.':'Pair a screen with the six-digit code.'}</span></button>
    <button type="button" data-go="mixdata"><b>4. Open MIXDATA</b><span>See what played, where, and for how long.</span></button>
  </div>`;
  const topbar=main.querySelector('.topbar');topbar?.insertAdjacentElement('afterend',panel);
  panel.addEventListener('click',e=>{const button=e.target.closest('[data-go]');if(button)go(button.dataset.go);});
}
function polish(){
  document.title='MIXXWAVE · Your room. Your MIXX.';
  replaceVisibleText();launchpad();
}
if(!document.getElementById('mixxwave-polish-style')){
  const style=document.createElement('style');style.id='mixxwave-polish-style';style.textContent=`
  .mixxwave-launchpad{margin:-9px 0 27px;padding:20px 22px;border:1px solid #d8ded1;border-radius:16px;background:linear-gradient(135deg,#fffefa,#edf1e7);box-shadow:0 12px 32px #23332908}
  .mixxwave-launchpad-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:15px}.mixxwave-launchpad-head p{font-size:12px;margin-top:4px}
  .mixxwave-launchpad-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.mixxwave-launchpad-grid button{min-height:104px;border:1px solid #d9dfd2;border-radius:12px;background:#fffefa;text-align:left;padding:15px;color:#29382c;transition:transform .15s,box-shadow .15s,border-color .15s}.mixxwave-launchpad-grid button:hover{transform:translateY(-2px);border-color:#aebca8;box-shadow:0 7px 16px #2434290b}.mixxwave-launchpad-grid b{display:block;font-size:12px;margin-bottom:7px}.mixxwave-launchpad-grid span{display:block;font-size:11px;line-height:1.45;color:#697269}
  @media(max-width:900px){.mixxwave-launchpad-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:520px){.mixxwave-launchpad{padding:17px;margin-bottom:22px}.mixxwave-launchpad-head{align-items:flex-start}.mixxwave-launchpad-grid{grid-template-columns:1fr}.mixxwave-launchpad-grid button{min-height:auto}.mixxwave-launchpad-head .badge{display:none}}
  `;document.head.append(style);
}
const app=document.getElementById('app');if(app)new MutationObserver(()=>queueMicrotask(polish)).observe(app,{childList:true,subtree:true});polish();
