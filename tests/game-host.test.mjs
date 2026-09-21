import test from 'node:test';
import assert from 'node:assert/strict';
import {createApplication,configuration} from '../apps/server/app.mjs';
import {hash} from '../apps/server/security.mjs';

async function fixture(t){
  const app=createApplication({config:configuration({NODE_ENV:'test',DB_PATH:':memory:',DEMO_MODE:'true',SIGNUPS_ENABLED:'true',APP_ORIGIN:'http://127.0.0.1',APP_SECRET:'game-host-acceptance-secret-2026'})});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>app.close());
  const base='http://127.0.0.1:'+app.server.address().port;
  async function request(path,body,headers={}){
    const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  async function account(name){
    const signup=await request('/api/auth/signup',{name,venueName:name+' Venue',email:name+'@example.test',password:'host-workflow-password-2026',type:'other'});
    assert.equal(signup.status,201);
    const session=(await request('/api/session',undefined,{Cookie:signup.cookie})).body;
    return {id:session.user.id,venue:session.venues[0].id,headers:{Cookie:signup.cookie,'X-Venue-Id':session.venues[0].id,'X-CSRF-Token':session.csrf}};
  }
  const owner=await account('owner'),other=await account('other');
  app.db.run("UPDATE users SET platform_role='admin' WHERE id=?",owner.id);
  const created=await request('/api/admin/games/proof-trials-demo',{},owner.headers);
  assert.equal(created.status,201);
  const eventId=created.body.id,host=()=>request('/api/games/'+eventId+'/host',undefined,owner.headers);
  const event=(await host()).body.event,match=event.matchups[0],judge=event.judges[0];
  const phase=async name=>request('/api/games/'+eventId+'/phase',{phase:name,matchupId:match.id,expectedRevision:(await host()).body.event.stateRevision},owner.headers);
  return {app,request,owner,other,account,eventId,host,event,match,judge,phase};
}

test('host discovery preserves venue, operator, publisher and private judge boundaries',async t=>{
  const {app,request,owner,other,eventId,host,match,judge,phase}=await fixture(t);
  assert.equal((await request('/api/games')).status,401);
  assert.equal((await request('/api/games/'+eventId+'/host')).status,401);
  assert.equal((await request('/api/games',undefined,other.headers)).body.events.length,1);
  const own=(await host()).body;
  assert.deepEqual(own.capabilities,{canControl:true,canPublish:true});
  assert.deepEqual(own.assignedJudges.map(j=>j.id),[judge.id]);
  assert.equal((await phase('predictions')).status,200);
  assert.equal((await phase('judging')).status,200);
  assert.equal((await request('/api/games/'+eventId+'/judge-submit',{matchupId:match.id,judgeId:judge.id,winnerEntryId:match.entryAId},owner.headers)).status,200);
  assert.equal((await host()).body.submissions[0].winnerEntryId,match.entryAId);
  const visitor=(await request('/api/games/'+eventId+'/host',undefined,other.headers)).body;
  assert.deepEqual(visitor.capabilities,{canControl:false,canPublish:false});
  assert.deepEqual(visitor.assignedJudges,[]);assert.deepEqual(visitor.submissions,[]);
  // Even an assigned operator does not gain another judge's private choices.
  app.db.run('INSERT INTO tasting_event_operators(event_id,user_id,created_at) VALUES(?,?,?)',eventId,other.id,Date.now());
  assert.deepEqual((await request('/api/games/'+eventId+'/host',undefined,other.headers)).body.submissions,[]);
  // An assigned judge sees their own choice only, without publication authority.
  app.db.run('UPDATE tasting_judge_users SET user_id=? WHERE judge_id=?',other.id,judge.id);
  const assigned=(await request('/api/games/'+eventId+'/host',undefined,other.headers)).body;
  assert.equal(assigned.assignedJudges[0].id,judge.id);assert.equal(assigned.submissions[0].winnerEntryId,match.entryAId);
  assert.equal((await request('/api/admin/games/'+eventId+'/publish-outcome',{matchupId:match.id,winnerEntryId:match.entryAId,expectedRevision:0},other.headers)).status,403);
  assert.equal((await request('/api/games/'+eventId+'/host',undefined,{...other.headers,'X-Venue-Id':owner.venue})).status,404);
  app.db.run("UPDATE members SET role='viewer' WHERE user_id=?",other.id);
  assert.equal((await request('/api/games',undefined,other.headers)).status,403);
  assert.equal((await request('/api/games/'+eventId+'/host',undefined,other.headers)).status,403);
  assert.equal((await request('/api/games/'+eventId+'/stop-presenting',{groupName:''},other.headers)).status,403);
  assert.equal((await request('/api/games/'+eventId+'/phase',{phase:'complete',expectedRevision:2},{...owner.headers,'X-CSRF-Token':''})).status,403);
});

test('publication requires a closed prediction phase and rejects missing or stale result revisions',async t=>{
  const {app,request,owner,eventId,host,match,event,phase}=await fixture(t);
  const publish=(revision,winner=match.entryAId,matchupId=match.id)=>request('/api/admin/games/'+eventId+'/publish-outcome',{matchupId,winnerEntryId:winner,expectedRevision:revision},owner.headers);
  assert.equal((await publish(0)).status,409,'cannot publish in lobby');
  assert.equal((await phase('predictions')).status,200);
  assert.equal((await publish(0)).status,409,'cannot publish while picks are open');
  assert.equal((await phase('judging')).status,200);
  assert.equal((await publish(undefined)).status,409,'a client must supply the reviewed result revision');
  assert.equal((await publish(0,event.matchups[1].entryAId,event.matchups[1].id)).status,409,'cannot publish a different matchup');
  assert.equal((await publish(0)).status,200);
  assert.equal((await publish(0,match.entryBId)).status,409,'a stale publisher must not silently overwrite the winner');
  assert.equal(app.db.get('SELECT COUNT(*) n FROM audit WHERE action=?','game.outcome.published').n,1);
  let result=(await host()).body.event.outcomes[0];
  assert.equal(result.revision,1);assert.equal(result.winnerEntryId,match.entryAId);
  assert.equal((await publish(1,match.entryBId)).status,200);
  result=(await host()).body.event.outcomes[0];
  assert.equal(result.revision,2);assert.equal(result.winnerEntryId,match.entryBId);
  assert.ok((await host()).body.lockedMatchupIds.includes(match.id));
});

test('stopping one venue presentation preserves the shared event and other venue screens',async t=>{
  const {app,request,owner,other,eventId,host}=await fixture(t);
  for(const [person,name] of [[owner,'owner'],[other,'other']]){
    app.db.run('INSERT INTO tvs(id,venue_id,name,group_name,token_hash,created_at) VALUES(?,?,?,?,?,?)',name,person.venue,name,'Room',hash(name+'-tv-token'),Date.now());
    assert.equal((await request('/api/games/'+eventId+'/present',{groupName:'Room'},person.headers)).status,200);
  }
  const screen=person=>request('/api/player/state',undefined,{Authorization:'Bearer '+person+'-tv-token'});
  assert.equal((await screen('owner')).body.game.id,eventId);
  assert.equal((await screen('other')).body.game.id,eventId);
  assert.equal((await request('/api/games/'+eventId+'/stop-presenting',{groupName:'Room'},owner.headers)).status,200);
  assert.equal((await screen('owner')).body.game,null);
  assert.equal((await screen('other')).body.game.id,eventId);
  assert.equal((await host()).body.event.status,'open');
  assert.deepEqual((await host()).body.presentations,[]);
  assert.equal((await request('/api/games/'+eventId+'/present',{groupName:'Room'},owner.headers)).status,200,'venue can resume presentation');
  assert.equal((await screen('owner')).body.game.id,eventId);
});
