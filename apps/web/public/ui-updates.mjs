const loadedVersion=document.querySelector('meta[name="mixxwave-ui-version"]')?.content;
let checking=false,dismissed='';
async function check(){
 if(!loadedVersion||checking||document.visibilityState==='hidden')return;
 checking=true;
 try{
  const response=await fetch('/api/ui-version',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(10000)});
  if(!response.ok)return;
  const {version}=await response.json();
  if(!/^[a-f0-9]{64}$/.test(version))return;
  if(version===loadedVersion){document.querySelector('[data-app-update]')?.remove();return;}
  if(version===dismissed||document.querySelector('[data-app-update]'))return;
  const notice=document.createElement('aside');notice.className='app-update';notice.dataset.appUpdate='';notice.setAttribute('aria-label','Application update');
  notice.innerHTML='<div role="status"><strong>A new version is ready.</strong><p>Save your changes, then reload to see it.</p></div><button type="button" class="btn small" data-update-reload>Reload app</button><button type="button" class="btn ghost small" data-update-later>Later</button>';
  notice.querySelector('[data-update-reload]').onclick=()=>{if(document.querySelector('dialog[open],.playback-controls-overlay')){notice.querySelector('p').textContent='Save or close your open editor, then reload.';return;}location.reload();};
  notice.querySelector('[data-update-later]').onclick=()=>{dismissed=version;notice.remove();};
  document.body.append(notice);
 }catch{/* An unavailable update check must never interrupt the app or TV controls. */}
 finally{checking=false;}
}
setInterval(check,60000);
document.addEventListener('visibilitychange',check);
window.addEventListener('focus',check);
check();
