/** Self-paced UI testing only. No video, timer, speech, or live-game write API. */
import {fresh,restore,advance,phase,choose,score} from './engine.mjs';
const $=id=>document.getElementById(id);
let episode,state,key,storageOK=true;
const buttons=[...document.querySelectorAll('[data-choice]')];
const newRun=()=>advance(episode,fresh(episode),episode.question.open);
function persist(){
  try { sessionStorage.setItem(key,JSON.stringify(state)); }
  catch { storageOK=false; }
  if(!storageOK) $('storage-note').textContent='Storage is unavailable. This run stays on this page only; refreshing clears it. Fictional scores, no prizes or live points.';
}
function render(){
  const revealed=phase(episode,state)==='reveal', earned=score(episode,state);
  const picked=episode.question.choices.find(c=>c.id===state.pick);
  const winner=episode.question.choices.find(c=>c.id===episode.question.correct);
  $('points').replaceChildren(document.createTextNode(earned+' '),Object.assign(document.createElement('small'),{textContent:'/ '+episode.question.points}));
  $('phase').textContent=revealed?'THE DEMO VERDICT':'PICK YOUR WINNER';
  $('question-title').textContent=revealed?(earned?'You called it.':winner.name+' takes it.'):'Who takes the win?';
  $('instruction').textContent=revealed?'Fictional panel: '+episode.question.choices.map(c=>c.name+' — '+c.score).join(' · ')+'.':'Choose a sample, then reveal the result.';
  for(const button of buttons){
    const c=episode.question.choices.find(c=>c.id===button.dataset.choice),selected=state.pick===c.id,won=revealed&&c.id===episode.question.correct;
    button.disabled=revealed;button.setAttribute('aria-pressed',String(selected));
    button.classList.toggle('winner',won);
    button.querySelector('.pick-mark').textContent=selected?'✓':'↗';
    button.querySelector('.choice-status').textContent=won?(selected?'YOUR PICK · WINNER':'DEMO WINNER'):selected?'✓ YOUR PICK':revealed?'NOT THE WINNER':'TAP TO PICK';
    const value=button.querySelector('.judge-score');value.hidden=!revealed;
    value.replaceChildren(document.createTextNode(c.score+' '),Object.assign(document.createElement('small'),{textContent:'/ 100'}));
  }
  $('feedback').textContent=revealed?(earned?'+1 practice point. Nothing added to live scores.':'0 practice points. Try the other sample next time.'):(picked?picked.name+' '+(storageOK?'saved in this tab.':'selected for this page.'):'Tap either sample. There is no timer.');
  $('reveal').hidden=revealed;$('reveal').disabled=!picked;$('restart').hidden=!revealed;
  $('result-note').hidden=!revealed;
  $('verdict').textContent='This is a test result—not an actual judge evaluation.';
  $('step-pick').classList.toggle('current',!revealed);$('step-reveal').classList.toggle('current',revealed);
}
function error(message){$('error').textContent=message;$('error').hidden=!message;$('retry').hidden=!message;}
async function init(){
  error('');
  try {
    const response=await fetch('/rehearsal/episode.json',{cache:'no-cache',signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Error('The matchup could not load.');
    episode=await response.json();key=episode.id+':quick:v'+episode.version;state=newRun();
    if(episode.question.choices.length!==buttons.length)throw Error('This test needs two samples.');
    try { const saved=JSON.parse(sessionStorage.getItem(key)||'null');if(saved){state=restore(episode,saved);if(phase(episode,state)==='intro')state=newRun();} }
    catch { state=newRun(); }
    // All labels originate in the same cue sheet as the optional timing test.
    for(const button of buttons){const c=episode.question.choices.find(c=>c.id===button.dataset.choice);if(!c)throw Error('Sample not found.');button.querySelector('.number').textContent=c.id;button.querySelector('.profile').textContent=c.profile;button.setAttribute('aria-label','Pick '+c.name);}
    persist();render();
  } catch(e){error(e.name==='TimeoutError'?'Connection timed out. Try loading again.':e.message);$('feedback').textContent='Nothing has been submitted.';}
}
for(const button of buttons)button.addEventListener('click',()=>{if(!state||button.disabled)return;state=choose(episode,state,button.dataset.choice);persist();render();});
$('reveal').addEventListener('click',()=>{if(!state||!state.pick||phase(episode,state)==='reveal')return;state=advance(episode,state,episode.question.reveal);persist();render();$('restart').focus({preventScroll:true});});
$('restart').addEventListener('click',()=>{state=newRun();persist();render();buttons[0].focus({preventScroll:true});});
$('retry').addEventListener('click',init);
void init();
