/** A decorative frame uses the existing video, never a second decoder/audio source. */
export function mountBillboard({video,stage,clock,context}){
 const panel=document.getElementById('billboard'),canvas=document.getElementById('portrait-backdrop'),ctx=canvas.getContext('2d',{alpha:false});
 const title=document.getElementById('billboard-title'),body=document.getElementById('billboard-description'),qr=document.getElementById('billboard-qr'),qrBox=document.getElementById('billboard-qr-box'),venue=document.getElementById('billboard-venue');
 const reduce=matchMedia('(prefers-reduced-motion: reduce)');let latest=null,renderKey='',painted=false,qrFailed='';
 function render(){
  const c=context(),portrait=video.videoWidth>0&&video.videoWidth<video.videoHeight;
  stage.classList.toggle('portrait-video',portrait);
  if(portrait)stage.style.setProperty('--portrait-width',(100*video.videoWidth/video.videoHeight)+'vh');
  const visible=!!(portrait&&latest&&latest.expiresAt>clock()&&c.expiresAt>clock()&&c.eligible&&!c.blocked&&!document.hidden&&video.readyState>=2&&!video.error);
  stage.classList.toggle('has-billboard',visible);panel.classList.toggle('hidden',!visible);
  if(visible){const key=JSON.stringify([latest.id,latest.revision,latest.title,latest.description,latest.qrImage,c.venueName]);if(key!==renderKey){renderKey=key;title.textContent=latest.title;body.textContent=latest.description;venue.textContent=c.venueName||'Your venue';if(latest.qrImage&&latest.qrImage!==qrFailed)qr.src=latest.qrImage;else qr.removeAttribute('src');}qrBox.classList.toggle('hidden',!latest.qrImage||latest.qrImage===qrFailed);}
  else{qr.removeAttribute('src');renderKey='';}
  if(portrait&&ctx&&!document.hidden&&!c.blocked&&video.readyState>=2&&(!painted||(!reduce.matches&&!video.paused))){
   try{ctx.drawImage(video,0,0,canvas.width,canvas.height);painted=true;}catch{canvas.style.opacity='0';}
  }
 }
 video.addEventListener('emptied',()=>{painted=false;canvas.style.opacity='';stage.classList.remove('has-billboard','portrait-video');panel.classList.add('hidden');qr.removeAttribute('src');renderKey='';});
 for(const event of ['loadedmetadata','loadeddata','playing','pause','error'])video.addEventListener(event,render);
 document.addEventListener('visibilitychange',render);window.addEventListener('resize',render);
 qr.addEventListener('error',()=>{qrFailed=latest?.qrImage||'';qrBox.classList.add('hidden');qr.removeAttribute('src');});
 window.addEventListener('offline',()=>{latest=null;render();});setInterval(render,250);
 return {update(value){latest=value;render();},clear(){latest=null;render();}};
}
