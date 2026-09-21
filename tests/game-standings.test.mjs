import test from 'node:test';
import assert from 'node:assert/strict';
import {createApplication,configuration} from '../apps/server/app.mjs';
import {hash} from '../apps/server/security.mjs';

test('TV, phone and publication responses share bracket and judge scores before and after correction',async t=>{
  const app=createApplication({config:configuration({NODE_ENV:'test',DB_PATH:':memory:',DEMO_MODE:'true',SIGNUPS_ENABLED:'true',APP_ORIGIN:'http://127.0.0.1',APP_SECRET:'shared-game-standings-tests-2026'})});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>app.close());
  const base='http://127.0.0.1:'+app.server.address().port;
  async function request(path,body,headers={}){
    const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
    const result={status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
    assert.ok(r.ok,JSON.stringify(result));return result;
  }
  const owner=await request('/api/auth/signup',{name:'Operator',venueName:'Score Test',email:'scores@example.test',password:'shared-standings-test-password',type:'other'});
  const session=(await request('/api/session',undefined,{Cookie:owner.cookie})).body,venueId=session.venues[0].id;
  const headers={Cookie:owner.cookie,'X-Venue-Id':venueId,'X-CSRF-Token':session.csrf};
  app.db.run("UPDATE users SET platform_role='admin' WHERE id=?",session.user.id);
  const created=(await request('/api/admin/games/proof-trials-demo',{},headers)).body;
  app.db.run('INSERT INTO tvs(id,venue_id,name,group_name,token_hash,created_at) VALUES(?,?,?,?,?,?)','score-tv',venueId,'Score TV','Room',hash('score-test-token'),Date.now());
  await request('/api/games/'+created.id+'/present',{groupName:'Room'},headers);
  const snapshot=async()=>(await request('/api/public/games/PROOF26')).body;
  const tv=async()=>(await request('/api/player/state',undefined,{Authorization:'Bearer score-test-token'})).body;
  const start=await snapshot(),match=start.event.matchups[0],judge=start.event.judges[0];
  const phase=async name=>{const state=(await snapshot()).event;return request('/api/games/'+created.id+'/phase',{phase:name,matchupId:match.id,expectedRevision:state.stateRevision},headers);};
  const people=[];
  for(const [name,bracket,judgePick] of [['Alex','A','A'],['Blair','B','B'],['Casey','B','A']]){
    const p=await request('/api/public/games/PROOF26/join',{name,locationKind:'home'});people.push({name,bracket,judgePick,cookie:p.cookie,id:p.body.participant.id});
  }
  await phase('predictions');
  for(const p of people)for(const [kind,choice] of [['bracket',p.bracket],['judge',p.judgePick]])await request('/api/public/games/PROOF26/predict',{matchupId:match.id,entryId:choice==='A'?match.entryAId:match.entryBId,kind,judgeId:judge.id},{Cookie:p.cookie});
  await phase('judging');
  await request('/api/games/'+created.id+'/judge-submit',{matchupId:match.id,judgeId:judge.id,winnerEntryId:match.entryAId},headers);
  assert.ok((await snapshot()).standings.every(row=>row.totalPoints===0),'phones keep unpublished judge choices private');
  assert.ok((await tv()).game.standings.every(row=>row.points===0),'TVs keep unpublished judge choices private');
  for(const [winner,expected] of [[match.entryAId,[['Alex',2],['Casey',1],['Blair',0]]],[match.entryBId,[['Casey',2],['Alex',1],['Blair',1]]]]){
    const published=(await request('/api/admin/games/'+created.id+'/publish-outcome',{matchupId:match.id,winnerEntryId:winner},headers)).body;
    const phone=await snapshot(),screen=await tv();
    assert.deepEqual(phone.standings.map(row=>[row.name,row.totalPoints]),expected);
    assert.deepEqual(published.standings,phone.standings);
    assert.deepEqual(screen.game.standings.map(row=>[row.name,row.points]),expected,'the shared TV must include judge points and use the same ranking as phones');
    assert.deepEqual(screen.game.standings.map(({points,...row})=>row),phone.standings);
  }
  await phase('results');await phase('complete');
  assert.equal((await tv()).game,null,'completion removes the event from the TV');
  assert.equal((await snapshot()).event.status,'final');
  assert.equal(app.db.get('SELECT COUNT(*) n FROM game_participants').n,3);
});
