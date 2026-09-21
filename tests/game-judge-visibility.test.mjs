import test from 'node:test';
import assert from 'node:assert/strict';
import {createApplication,configuration} from '../apps/server/app.mjs';

test('judge choices cannot be inferred or changed through scores before publication',async t=>{
  const app=createApplication({config:configuration({NODE_ENV:'test',DB_PATH:':memory:',DEMO_MODE:'true',SIGNUPS_ENABLED:'true',APP_ORIGIN:'http://127.0.0.1',APP_SECRET:'judge-visibility-regression-test-secret-2026'})});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(()=>app.close());
  const base='http://127.0.0.1:'+app.server.address().port;
  async function request(path,body,headers={}){
    const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  const staff=await request('/api/auth/signup',{name:'Operator',venueName:'Judge Test Venue',email:'judge-test@example.test',password:'judge-visibility-password-2026',type:'bourbon-bar',timezone:'America/Chicago'});
  assert.equal(staff.status,201);
  const session=(await request('/api/session',undefined,{Cookie:staff.cookie})).body;
  const headers={Cookie:staff.cookie,'X-Venue-Id':session.venues[0].id,'X-CSRF-Token':session.csrf};
  app.db.run("UPDATE users SET platform_role='admin' WHERE id=?",session.user.id);
  const demo=await request('/api/admin/games/proof-trials-demo',{},headers);
  assert.equal(demo.status,201);
  const eventId=demo.body.id;
  const player=await request('/api/public/games/PROOF26/join',{name:'Taylor',locationKind:'home'});
  assert.equal(player.status,200);
  const playerHeaders={Cookie:player.cookie};
  const snapshot=async()=>(await request('/api/public/games/PROOF26',undefined,playerHeaders)).body;
  let state=await snapshot();
  const matchup=state.event.matchups[0],other=state.event.matchups[1],judge=state.event.judges[0];
  const judgeSubmit=(target,winner)=>request('/api/games/'+eventId+'/judge-submit',{matchupId:target.id,judgeId:judge.id,winnerEntryId:winner},headers);
  assert.equal((await request('/api/games/'+eventId+'/phase',{phase:'predictions',matchupId:matchup.id,seconds:60,expectedRevision:state.event.stateRevision},headers)).status,200);
  assert.equal((await judgeSubmit(matchup,matchup.entryAId)).status,409,'judge submission must wait until picks close');

  // Existing data can contain an early submission from older application versions.
  app.db.run('INSERT INTO tasting_judge_submissions(matchup_id,judge_id,winner_entry_id,submitted_at) VALUES(?,?,?,?)',matchup.id,judge.id,matchup.entryAId,Date.now());
  const predict=entryId=>request('/api/public/games/PROOF26/predict',{matchupId:matchup.id,judgeId:judge.id,entryId,kind:'judge'},playerHeaders);
  for(const entryId of [matchup.entryBId,matchup.entryAId]){
    assert.equal((await predict(entryId)).status,200);
    state=await snapshot();
    assert.equal(state.event.outcomes.length,0);
    assert.equal(state.standings[0].judgePoints,0,'unpublished judge choices must not become a score oracle');
    assert.equal(state.standings[0].totalPoints,0);
  }
  assert.equal((await request('/api/games/'+eventId+'/phase',{phase:'judging',matchupId:matchup.id,expectedRevision:state.event.stateRevision},headers)).status,200);
  assert.equal((await judgeSubmit(other,other.entryAId)).status,409,'a different matchup is not open for judging');
  assert.equal((await judgeSubmit(matchup,matchup.entryAId)).status,200);
  assert.equal((await predict(matchup.entryBId)).status,409);
  assert.equal((await snapshot()).standings[0].judgePoints,0,'judging does not itself publish the choice');
  const published=await request('/api/admin/games/'+eventId+'/publish-outcome',{matchupId:matchup.id,winnerEntryId:matchup.entryAId,expectedRevision:0},headers);
  assert.equal(published.status,200);
  assert.equal(published.body.standings[0].judgePoints,1);
  assert.equal((await snapshot()).standings[0].totalPoints,1);
  assert.equal((await predict(matchup.entryBId)).status,409,'published results cannot be used to revise a prediction');
  assert.equal((await judgeSubmit(matchup,matchup.entryBId)).status,409,'publication closes ordinary judge editing');
});
