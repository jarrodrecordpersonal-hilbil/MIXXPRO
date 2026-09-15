/** A dedicated, authenticated reporting surface; keep the venue remote uncluttered. */
function link() {
  const navigation=document.querySelector('.navigation');
  if(!navigation||navigation.querySelector('[data-screen-activity]'))return;
  const a=document.createElement('a');a.href='/screens';a.dataset.screenActivity='true';
  a.textContent='MIXDATA';a.setAttribute('aria-label','MIXDATA: screen activity, what played, when and where');
  navigation.append(a);
}
new MutationObserver(link).observe(document.getElementById('app'),{childList:true,subtree:true});link();
