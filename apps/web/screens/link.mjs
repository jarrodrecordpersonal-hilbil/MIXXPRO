/** MIXDATA navigation + MIXXWAVE top-left brand treatment. */
function brand(){
  for(const mark of document.querySelectorAll('.wordmark')){
    if(mark.dataset.mixxwaveBrand==='true')continue;
    const text=(mark.textContent||'').replace(/\s+/g,'').toUpperCase();
    if(!text.includes('MIXXPRO'))continue;
    mark.dataset.mixxwaveBrand='true';
    mark.classList.add('mixxwave-wordmark');
    mark.setAttribute('aria-label','MIXXWAVE');
    mark.innerHTML='<img src="/mixxwave-logo.svg" alt="MIXXWAVE">';
  }
  if(!document.getElementById('mixxwave-brand-style')){
    const style=document.createElement('style');style.id='mixxwave-brand-style';
    style.textContent='.wordmark.mixxwave-wordmark{display:block;padding:0 9px;line-height:0}.wordmark.mixxwave-wordmark>img{display:block;width:132px;height:auto;max-height:98px;object-fit:contain;object-position:left center}.auth-story .wordmark.mixxwave-wordmark>img{width:174px;max-height:130px}.sidebar .tagline{margin-left:9px}';
    document.head.append(style);
  }
}
function link(){
  brand();
  const navigation=document.querySelector('.navigation');
  if(!navigation||navigation.querySelector('[data-screen-activity]'))return;
  const a=document.createElement('a');a.href='/screens';a.dataset.screenActivity='true';
  a.textContent='MIXDATA';a.setAttribute('aria-label','MIXDATA: screen activity, what played, when and where');
  navigation.append(a);
}
new MutationObserver(link).observe(document.getElementById('app'),{childList:true,subtree:true});link();
