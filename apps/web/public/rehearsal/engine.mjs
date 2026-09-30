/** Local practice state only. Never submit this state to live-game APIs. */
export function fresh(episode) {
  return {version:episode.version, position:0, seenTo:0, pick:null};
}
export function restore(episode, value) {
  const clean=fresh(episode);
  if (!value || value.version!==episode.version) return clean;
  for (const key of ['position','seenTo']) {
    if (!Number.isFinite(value[key]) || value[key]<0 || value[key]>episode.duration) return fresh(episode);
    clean[key]=value[key];
  }
  clean.seenTo=Math.max(clean.seenTo,clean.position);
  clean.pick=episode.question.choices.some(c=>c.id===value.pick)?value.pick:null;
  return clean;
}
export function advance(episode, state, time) {
  const position=Number.isFinite(time)?Math.min(episode.duration,Math.max(0,time)):state.position;
  return {...state,position,seenTo:Math.max(state.seenTo,position)};
}
export function phase(episode,state) {
  const q=episode.question;
  if(state.position>=q.reveal) return 'reveal';
  if(state.seenTo>=q.close) return 'locked';
  if(state.position>=q.open && state.position<q.close) return 'question';
  return 'intro';
}
export function choose(episode,state,id) {
  if(phase(episode,state)!=='question' || !episode.question.choices.some(c=>c.id===id)) return state;
  return {...state,pick:id};
}
export function score(episode,state) {
  return state.seenTo>=episode.question.reveal && state.pick===episode.question.correct?episode.question.points:0;
}
export function remaining(episode,state) {
  return phase(episode,state)==='question'?Math.max(0,Math.ceil(episode.question.close-state.position)):0;
}
