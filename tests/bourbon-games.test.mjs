import test from 'node:test';
import assert from 'node:assert/strict';
import {createApplication,configuration} from '../apps/server/app.mjs';
import {hash} from '../apps/server/security.mjs';

test('Proof Trials shares one event and scored identity across home and venue presentation',async()=>{
 const config=configuration({NODE_ENV:'test',DB_PATH:':memory:',DEMO_MODE:'true',SIGNUPS_ENABLED:'true',APP_ORIGIN:'http://127.0.0.1',APP_SECRET:'proof-trials-test-secret-123456789012345'});
 const app=createApplication({config});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 try{
  let response=await fetch(base+'/api/auth/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Host',venueName:'Proof Venue',email:'host@proof.test',password:'proof-trials-password',type:'bourbon-bar',timezone:'America/Chicago'})});assert.equal(response.status,201);
  const staffCookie=response.headers.get('set-cookie').split(';')[0],session=await (await fetch(base+'/api/session',{headers:{Cookie:staffCookie}})).json(),venueId=session.venues[0].id,staffHeaders={Cookie:staffCookie,'X-Venue-Id':venueId,'X-CSRF-Token':session.csrf,'Content-Type':'application/json'};
  app.db.run("UPDATE users SET platform_role='admin' WHERE id=?",session.user.id);
  response=await fetch(base+'/api/admin/games/proof-trials-demo',{method:'POST',headers:staffHeaders,body:'{}'});let body=await response.json();assert.equal(response.status,201,JSON.stringify(body));const eventId=body.id;
  const deviceToken='proof-tv-token';app.db.run('INSERT INTO tvs(id,venue_id,name,group_name,token_hash,created_at) VALUES(?,?,?,?,?,?)','proof-tv',venueId,'Tasting TV','Tasting Room',hash(deviceToken),Date.now());
  response=await fetch(base+'/api/games/'+eventId+'/present',{method:'POST',headers:staffHeaders,body:JSON.stringify({groupName:'Tasting Room'})});assert.equal(response.status,200);
  response=await fetch(base+'/api/auth/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Other Host',venueName:'Other Proof Venue',email:'other@proof.test',password:'proof-trials-password',type:'bourbon-bar',timezone:'America/Chicago'})});assert.equal(response.status,201);
  const otherCookie=response.headers.get('set-cookie').split(';')[0],otherSession=await (await fetch(base+'/api/session',{headers:{Cookie:otherCookie}})).json(),otherVenueId=otherSession.venues[0].id,otherHeaders={Cookie:otherCookie,'X-Venue-Id':otherVenueId,'X-CSRF-Token':otherSession.csrf,'Content-Type':'application/json'};
  app.db.run('INSERT INTO tvs(id,venue_id,name,group_name,token_hash,created_at) VALUES(?,?,?,?,?,?)','other-proof-tv',otherVenueId,'Other Tasting TV','Other Room',hash('other-tv-token'),Date.now());
  response=await fetch(base+'/api/games/'+eventId+'/present',{method:'POST',headers:otherHeaders,body:JSON.stringify({groupName:'Other Room'})});assert.equal(response.status,200,'another venue may present the shared event locally');
  response=await fetch(base+'/api/games/'+eventId+'/phase',{method:'POST',headers:otherHeaders,body:JSON.stringify({phase:'complete'})});assert.equal(response.status,403,'presenting a shared event must not grant global event authority');
  response=await fetch(base+'/api/player/state',{headers:{Authorization:'Bearer '+deviceToken}});body=await response.json();assert.equal(response.status,200);assert.equal(body.game.id,eventId);assert.equal(body.game.code,'PROOF26');

  response=await fetch(base+'/api/public/games/PROOF26/join',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Taylor',locationKind:'home'})});body=await response.json();assert.equal(response.status,200);const gameCookie=response.headers.get('set-cookie').split(';')[0],participantId=body.participant.id;
  response=await fetch(base+'/api/public/games/PROOF26/join',{method:'POST',headers:{'Content-Type':'application/json',Cookie:gameCookie},body:JSON.stringify({name:'Taylor',locationKind:'venue',venueId,roomKey:'Tasting Room'})});body=await response.json();assert.equal(body.participant.id,participantId,'same browser identity must not create a second scored participant');
  assert.equal(app.db.get('SELECT COUNT(*) n FROM game_participants WHERE event_id=?',eventId).n,1);
  assert.equal(app.db.get('SELECT COUNT(*) n FROM game_participation WHERE participant_id=?',participantId).n,2);

  const event=(await (await fetch(base+'/api/public/games/PROOF26',{headers:{Cookie:gameCookie}})).json()).event,matchup=event.matchups[0],judge=event.judges[0];
  response=await fetch(base+'/api/public/games/PROOF26/link-device',{method:'POST',headers:{'Content-Type':'application/json',Cookie:gameCookie},body:'{}'});body=await response.json();assert.equal(response.status,201,JSON.stringify(body));const resumeCode=body.code;
  response=await fetch(base+'/api/public/games/PROOF26/resume',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:resumeCode})});body=await response.json();assert.equal(response.status,200,JSON.stringify(body));const resumedCookie=response.headers.get('set-cookie').split(';')[0];assert.equal(body.participant.id,participantId,'device resume must preserve the scored participant identity');
  assert.equal(app.db.get('SELECT COUNT(*) n FROM game_participants WHERE event_id=?',eventId).n,1);
  response=await fetch(base+'/api/games/'+eventId+'/phase',{method:'POST',headers:staffHeaders,body:JSON.stringify({phase:'predictions',matchupId:matchup.id,seconds:60})});body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.event.phase,'predictions');assert.equal(body.event.activeMatchupId,matchup.id);assert.ok(body.event.phaseDeadline>Date.now());
  response=await fetch(base+'/api/games/'+eventId+'/judge-submit',{method:'POST',headers:otherHeaders,body:JSON.stringify({matchupId:matchup.id,judgeId:judge.id,winnerEntryId:matchup.entryAId})});assert.equal(response.status,403,'presenting venue must not impersonate an assigned judge');
  response=await fetch(base+'/api/games/'+eventId+'/judge-submit',{method:'POST',headers:staffHeaders,body:JSON.stringify({matchupId:matchup.id,judgeId:judge.id,winnerEntryId:matchup.entryAId})});assert.equal(response.status,200);

  response=await fetch(base+'/api/public/games/PROOF26/predict',{method:'POST',headers:{'Content-Type':'application/json',Cookie:resumedCookie},body:JSON.stringify({matchupId:matchup.id,entryId:matchup.entryAId,kind:'bracket'})});assert.equal(response.status,200);
  response=await fetch(base+'/api/admin/games/'+eventId+'/publish-outcome',{method:'POST',headers:staffHeaders,body:JSON.stringify({matchupId:matchup.id,winnerEntryId:matchup.entryAId})});body=await response.json();assert.equal(body.standings[0].totalPoints,1);assert.equal(body.standings[0].bracketPoints,1);
  response=await fetch(base+'/api/admin/games/'+eventId+'/publish-outcome',{method:'POST',headers:staffHeaders,body:JSON.stringify({matchupId:matchup.id,winnerEntryId:matchup.entryBId})});body=await response.json();assert.equal(body.standings[0].totalPoints,0,'published correction must deterministically recompute score');
  assert.equal(app.db.get('SELECT revision FROM tasting_outcomes WHERE matchup_id=?',matchup.id).revision,2);
 }finally{await app.close();}
});
