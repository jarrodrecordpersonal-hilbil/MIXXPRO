import {fresh,restore,advance,phase,choose,score,remaining} from './engine.mjs';
const $=id=>document.getElementById(id), video=$('video');
let episode,state,key,lastSaved=-1,ready=false,storeOK=true,lastPhase='',pendingResume=true;
const format=t=>Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');
function text(id,value){if($(id).textContent!==value)$(id).textContent=value;}
function report(message){$('error').hidden=!message;$('error').textContent=message;}
function persist(){
  try{sessionStorage.setItem(key,JSON.stringify(state));}
  catch{storeOK=false;$('storage-note').textContent='Practice only. Browser storage is unavailable; refreshing will clear this run. Live scores are untouched.';}
}
function sync(){
  if(!episode||pendingResume)return;
  state=advance(episode,state,video.currentTime);
  const current=phase(episode,state), q=episode.question;
  const winner=q.choices.find(c=>c.id===q.correct);
  $('points').replaceChildren(document.createTextNode(String(score(episode,state))+' '),Object.assign(document.createElement('small'),{textContent:'/ '+q.points}));
  $('time').textContent=format(state.position)+' / '+format(episode.duration);
  $('start').textContent=video.ended?'Replay episode':video.paused?'Play episode':'Pause episode';
  const playback=video.error?'Video unavailable':video.seeking?'Seeking…':video.paused?'Paused':video.readyState<3?'Buffering…':'Playing';
  text('playback',playback);
  const open=current==='question';
  $('phase').textContent=({intro:'ONE ROUND · ONE PICK',question:'MAKE YOUR PICK',locked:'PICKS LOCKED',reveal:'DEMO RESULT'})[current];
  $('question-title').textContent=({intro:'Watch the samples.',question:q.text,locked:'Your pick is locked.',reveal:winner.name+' wins.'})[current];
  if(state.position<0.1 && state.seenTo===0)$('question-title').textContent='Ready for your first round?';
  $('instruction').textContent=({intro:'Your question opens at '+format(q.open)+'. Pause whenever you need.',question:'Tap a sample. You can change it until the timer ends.',locked:state.position<q.close?'This run already passed the deadline. Restart to pick again.':'The reveal is next. No changes to this run.',reveal:'Fictional panel: '+q.choices.map(c=>c.name+' — '+c.score).join('. ')+'.'})[current];
  $('countdown').hidden=!open;$('countdown').textContent=remaining(episode,state)+'s';
  $('answers').hidden=current==='intro';
  for(const button of $('answers').children){
    const id=button.dataset.choice,selected=state.pick===id;
    button.disabled=!open||!ready||video.seeking||!!video.error;
    button.setAttribute('aria-pressed',String(selected));
    button.classList.toggle('winner',current==='reveal'&&id===q.correct);
    button.querySelector('span').textContent=current==='reveal'&&id===q.correct?(selected?'✓ YOUR PICK · WINNER':'DEMO WINNER'):selected?'✓ PICK SAVED':open?'TAP TO PICK':'NOT SELECTED';
  }
  const feedback=state.pick?(storeOK?'Pick saved in this tab: Sample ':'Pick kept for this page only: Sample ')+state.pick+'.':current==='locked'?'No pick was saved before the deadline.':current==='reveal'?'No pick this run. Restart practice to try it.':'';
  text('feedback',feedback);
  $('result').hidden=current!=='reveal';
  $('verdict').textContent=score(episode,state)?'You called it. +1 practice point.':state.pick?'Not this time. 0 practice points. Try another run.':'0 practice points. You can restart whenever you like.';
  // Storage writes at most once per media second, plus explicit pick/pause actions.
  const second=Math.floor(state.position);
  if(lastSaved!==second||current!==lastPhase){persist();lastSaved=second;lastPhase=current;}
}
async function playPause(){
  if(video.ended){if(!restart())return;}
  if(!video.paused){video.pause();return;}
  try{await video.play();report('');}catch{report('Playback did not start. Press the video’s own Play button, or reload this page.');}
}
function restart(){
  if(state.seenTo>0&&!confirm('Start a new practice run? This clears only the pick and points in this tab.'))return false;
  video.pause();state=fresh(episode);lastSaved=-1;video.currentTime=0;persist();sync();return true;
}
async function init(){
  const response=await fetch('/rehearsal/episode.json',{cache:'no-cache'});
  if(!response.ok)throw Error('The practice script could not load. Refresh this page.');
  episode=await response.json();key=episode.id+':v'+episode.version;state=fresh(episode);
  try{state=restore(episode,JSON.parse(sessionStorage.getItem(key)||'null'));}catch{persist();}
  for(const choice of episode.question.choices){
    const button=document.createElement('button');button.type='button';button.dataset.choice=choice.id;button.setAttribute('aria-pressed','false');
    const tag=document.createElement('span'),name=document.createElement('b'),profile=document.createElement('small');name.textContent=choice.name;profile.textContent=choice.profile;button.append(tag,name,profile);
    button.addEventListener('click',()=>{sync();if(button.disabled)return;state=choose(episode,state,choice.id);persist();sync();});$('answers').append(button);
  }
  for(const cue of episode.scenes){const p=document.createElement('p'),label=document.createElement('b');label.textContent=format(cue.start)+' · '+cue.heading;p.append(label,document.createTextNode(cue.narration));$('transcript').append(p);}
  const resumeAt=state.position;
  const loaded=()=>{pendingResume=false;ready=true;$('start').disabled=false;$('restart').disabled=false;if(resumeAt>0)video.currentTime=resumeAt;sync();};
  if(video.readyState>=1)loaded();else video.addEventListener('loadedmetadata',loaded,{once:true});
  for(const event of ['timeupdate','play','pause','seeking','seeked','waiting','playing','ended','ratechange'])video.addEventListener(event,sync);
  video.addEventListener('error',()=>{ready=false;$('start').disabled=true;report('The rehearsal video could not load. Refresh after the latest preview deploy. No answer was submitted to the live game.');sync();});
  $('start').addEventListener('click',playPause);$('restart').addEventListener('click',restart);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){video.pause();persist();}});
  window.addEventListener('pagehide',()=>{video.pause();persist();});
  // Media time, never wall time, is the practice clock. Pausing/buffering stops it.
  setInterval(()=>{if(ready&&!document.hidden)sync();},150);
  sync();
}
init().catch(error=>{report(error.message);$('start').textContent='Reload to try again';});
