import test from 'node:test';
import assert from 'node:assert/strict';
import {createApplication,configuration} from '../apps/server/app.mjs';
import {hash} from '../apps/server/security.mjs';

test('demo control room preserves event authority and private judge choices',async t=>{
  const app=createApplication({config:configuration({NODE_ENV:'test',DB_PATH:':memory:',DEMO_MODE:'true',SIGNUPS_ENABLED:'true',APP_SECRET:'game-console-test-secret-only-2026'})});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());
  const base='http://127.0.0.1:'+app.server.address().port;
  async function request(path,body,headers={}){
    const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
  }
  async function account(name){
    const signup=await request('/api/auth/signup',{name,venueName:name+' venue',email:name+'@console.test',password:'game-console-test-password',type:'bourbon-bar'});
    assert.equal(signup.status,201);
    const s=(await request('/api/session',undefined,{Cookie:signup.cookie})).body;
    return {id:s.user.id,venue:s.venues[0].id,headers:{Cookie:signup.cookie,'X-CSRF-Token':s.csrf,'X-Venue-Id':s.venues[0].id}};
  }
  const host=await account('host'),presenter=await account('presenter'),judgeUser=await account('judge'),viewer=await account('viewer');
  app.db.run("UPDATE users SET platform_role='admin' WHERE id=?",host.id);
  const demo=await request('/api/admin/games/proof-trials-demo',{},host.headers),eventId=demo.body.id;
  const state=async who=>(await request(`/api/games/${eventId}/console`,undefined,who.headers)).body;
  const first=await state(host),matchup=first.event.matchups[0],judge=first.event.judges[1];
  app.db.run('INSERT INTO tasting_judge_users(judge_id,user_id,created_at) VALUES(?,?,?)',judge.id,judgeUser.id,Date.now());
  app.db.run("UPDATE members SET role='viewer' WHERE user_id=?",viewer.id);
  for(const [who,group] of [[host,'Host room'],[presenter,'Other room']])app.db.run('INSERT INTO tvs(id,venue_id,name,group_name,token_hash,created_at) VALUES(?,?,?,?,?,?)',who.id+'-tv',who.venue,group+' TV',group,hash(who.id+'-device'),Date.now());

  await t.test('anonymous, guest, viewer and cross-venue console access are rejected',async()=>{
    assert.equal((await request('/api/games/console')).status,401);
    const guest=await request('/api/public/games/PROOF26/join',{name:'Guest'});
    assert.equal((await request(`/api/games/${eventId}/console`,undefined,{Cookie:guest.cookie,'X-Venue-Id':host.venue})).status,401);
    assert.equal((await request('/api/games/console',undefined,viewer.headers)).status,403);
    assert.equal((await request(`/api/games/${eventId}/console`,undefined,{...presenter.headers,'X-Venue-Id':host.venue})).status,404);
  });
  await t.test('capabilities reflect assignments, not knowledge of an event code',async()=>{
    const hostState=await state(host),otherState=await state(presenter),judgeState=await state(judgeUser);
    assert.equal(hostState.permissions.canOperate,true);assert.equal(hostState.permissions.canPublish,true);
    assert.deepEqual(otherState.permissions,{canOperate:false,canPublish:false,judgeIds:[]});
    assert.deepEqual(judgeState.permissions,{canOperate:false,canPublish:false,judgeIds:[judge.id]});
    assert.deepEqual(otherState.groups,['Other room']);assert.deepEqual(hostState.groups,['Host room']);
    assert.equal((await request(`/api/games/${eventId}/phase`,{phase:'complete',expectedRevision:0},presenter.headers)).status,403);
    assert.equal((await request(`/api/admin/games/${eventId}/publish-outcome`,{matchupId:matchup.id,winnerEntryId:matchup.entryAId},judgeUser.headers)).status,403);
  });
  await t.test('judges see only their own unpublished submissions',async()=>{
    assert.equal((await request(`/api/games/${eventId}/phase`,{phase:'predictions',matchupId:matchup.id,expectedRevision:0},host.headers)).status,200);
    assert.equal((await request(`/api/games/${eventId}/phase`,{phase:'judging',matchupId:matchup.id,expectedRevision:1},host.headers)).status,200);
    assert.equal((await request(`/api/games/${eventId}/judge-submit`,{matchupId:matchup.id,judgeId:judge.id,winnerEntryId:matchup.entryAId},judgeUser.headers)).status,200);
    const judgeState=await state(judgeUser);
    assert.deepEqual(judgeState.mySubmissions,[{matchupId:matchup.id,judgeId:judge.id,winnerEntryId:matchup.entryAId}]);
    assert.deepEqual((await state(host)).mySubmissions,[],'administrator/operator does not get another judge choice');
    assert.deepEqual((await state(presenter)).mySubmissions,[]);
    assert.equal((await request('/api/public/games/PROOF26')).body.mySubmissions,undefined);
    assert.deepEqual(judgeState.lockedMatchupIds,[matchup.id]);
  });
  await t.test('result revisions reject stale and malformed console corrections',async()=>{
    const url=`/api/admin/games/${eventId}/publish-outcome`,body={matchupId:matchup.id,winnerEntryId:matchup.entryAId,expectedResultRevision:0};
    assert.equal((await request(url,body,host.headers)).status,200);
    assert.equal((await request(url,{...body,winnerEntryId:matchup.entryBId},host.headers)).status,409);
    assert.equal((await request(url,{...body,expectedResultRevision:'1'},host.headers)).status,409);
    assert.equal((await request(url,{...body,expectedResultRevision:1,winnerEntryId:matchup.entryBId},host.headers)).status,200);
    const result=(await state(host)).event.outcomes[0];assert.equal(result.revision,2);assert.equal(result.winnerEntryId,matchup.entryBId);
  });
  await t.test('stop-presenting requires CSRF and affects only the selected venue and group',async()=>{
    for(const [who,group] of [[host,'Host room'],[presenter,'Other room']])assert.equal((await request(`/api/games/${eventId}/present`,{groupName:group},who.headers)).status,200);
    const url=`/api/games/${eventId}/stop-presenting`;
    assert.equal((await request(url,{groupName:'Other room'},{...presenter.headers,'X-CSRF-Token':''})).status,403);
    assert.equal((await request(url,{groupName:'Other room'},{...presenter.headers,'X-Venue-Id':host.venue})).status,404);
    assert.equal((await request(url,{groupName:'Other room'},presenter.headers)).status,200);
    assert.deepEqual((await state(host)).presentations,[{groupName:'Host room'}]);assert.deepEqual((await state(presenter)).presentations,[]);
    assert.equal((await state(host)).event.phase,'judging','local stop does not end the shared event');
  });
  await t.test('console assets have correct MIME types and are absent outside demo mode',async()=>{
    for(const [path,mime] of [['/games/host','text/html'],['/game-console.mjs','text/javascript'],['/game-console.css','text/css']]){
      const r=await fetch(base+path);assert.equal(r.status,200);assert.ok(r.headers.get('content-type').startsWith(mime));
    }
    app.config.DEMO_MODE=false;
    for(const path of ['/games/host','/game-console.mjs','/game-console.css','/api/games/console',`/api/games/${eventId}/console`])assert.equal((await fetch(base+path,{headers:host.headers})).status,404);
    assert.equal((await request(`/api/games/${eventId}/stop-presenting`,{groupName:'Host room'},host.headers)).status,404);
  });
});
