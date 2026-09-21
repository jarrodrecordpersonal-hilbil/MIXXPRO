import test from 'node:test';
import assert from 'node:assert/strict';
import {createApplication,configuration} from '../apps/server/app.mjs';
import {hash} from '../apps/server/security.mjs';

async function fixture(t){
  const config=configuration({NODE_ENV:'test',DB_PATH:':memory:',DEMO_MODE:'true',APP_ORIGIN:'http://127.0.0.1',APP_SECRET:'device-link-regression-test-secret-2026'});
  const app=createApplication({config});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(()=>app.close());
  const base='http://127.0.0.1:'+app.server.address().port;
  for(const code of ['LINKA','LINKB'])app.db.run('INSERT INTO tasting_events(id,code,name,status,created_at,updated_at) VALUES(?,?,?,?,?,?)',code,code,code,'open',Date.now(),Date.now());
  async function request(code,path='',body,cookie){
    const headers={'Content-Type':'application/json'};
    if(cookie)headers.Cookie=cookie;
    const response=await fetch(base+'/api/public/games/'+code+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  async function join(code='LINKA',cookie,name='Taylor'){
    const result=await request(code,'/join',{name,locationKind:'home'},cookie);
    assert.equal(result.status,200,JSON.stringify(result.body));
    return {...result,cookie:result.cookie||cookie};
  }
  async function link(cookie,code='LINKA'){
    const result=await request(code,'/link-device',{},cookie);
    assert.equal(result.status,201,JSON.stringify(result.body));
    return result.body.code;
  }
  return {app,request,join,link};
}

test('three devices retain one participant and one prediction after linking and rejoining',async t=>{
  const {app,request,join,link}=await fixture(t);
  const a=await join(),participantId=a.body.participant.id;
  const b=await request('LINKA','/resume',{code:await link(a.cookie)});
  assert.equal(b.status,200);
  const c=await request('LINKA','/resume',{code:await link(b.cookie)});
  assert.equal(c.status,200);
  for(const device of [a,b,c]){
    assert.equal((await request('LINKA','',undefined,device.cookie)).body.participant.id,participantId);
    assert.equal((await join('LINKA',device.cookie)).body.participant.id,participantId);
  }
  assert.equal(app.db.get('SELECT COUNT(*) n FROM game_participants WHERE event_id=?','LINKA').n,1);
  assert.equal(app.db.get('SELECT COUNT(*) n FROM game_participant_credentials WHERE event_id=? AND revoked_at IS NULL','LINKA').n,3);
  for(const [id,seed] of [['entry-a',1],['entry-b',2]])app.db.run('INSERT INTO tasting_entries(id,event_id,seed,name) VALUES(?,?,?,?)',id,'LINKA',seed,id);
  app.db.run('INSERT INTO tasting_matchups(id,event_id,round,slot,entry_a_id,entry_b_id) VALUES(?,?,?,?,?,?)','match','LINKA',1,1,'entry-a','entry-b');
  app.db.run("UPDATE tasting_events SET status='live',phase='predictions',active_matchup_id='match',phase_deadline=? WHERE id='LINKA'",Date.now()+60000);
  for(const [device,entryId] of [[a,'entry-a'],[b,'entry-b'],[c,'entry-a']])assert.equal((await request('LINKA','/predict',{matchupId:'match',entryId,kind:'bracket'},device.cookie)).status,200);
  const predictions=app.db.all('SELECT participant_id,entry_id FROM game_predictions');
  assert.equal(predictions.length,1);
  assert.equal(predictions[0].participant_id,participantId);
  assert.equal(predictions[0].entry_id,'entry-a','last accepted prediction replaces the prior choice');
});

test('a conflicting destination participant cannot consume or take over a link',async t=>{
  const {app,request,join,link}=await fixture(t);
  const a=await join(),b=await join('LINKA',undefined,'Morgan'),code=await link(a.cookie);
  assert.equal((await request('LINKA','/resume',{code},b.cookie)).status,409);
  assert.equal(app.db.get('SELECT used_at FROM game_identity_links WHERE code_hash=?',hash(code)).used_at,null);
  assert.equal((await request('LINKA','',undefined,b.cookie)).body.participant.id,b.body.participant.id);
  const c=await request('LINKA','/resume',{code});
  assert.equal(c.status,200);
  assert.equal(c.body.participant.id,a.body.participant.id);
});

test('linking an event preserves the destination identity in another event',async t=>{
  const {request,join,link}=await fixture(t);
  const a=await join(),b=await join('LINKB',undefined,'Other event');
  const resumed=await request('LINKA','/resume',{code:await link(a.cookie)},b.cookie);
  assert.equal(resumed.status,200);
  assert.equal(resumed.cookie,b.cookie,'the existing browser credential must be preserved');
  assert.equal((await request('LINKA','',undefined,b.cookie)).body.participant.id,a.body.participant.id);
  assert.equal((await request('LINKB','',undefined,b.cookie)).body.participant.id,b.body.participant.id);
});

test('superseded, wrong-event, expired and consumed link codes are rejected',async t=>{
  const {app,request,join,link}=await fixture(t);
  const a=await join(),old=await link(a.cookie),current=await link(a.cookie);
  assert.equal((await request('LINKA','/resume',{code:old})).status,400);
  assert.equal((await request('LINKB','/resume',{code:current})).status,400);
  assert.equal(app.db.get('SELECT used_at FROM game_identity_links WHERE code_hash=?',hash(current)).used_at,null);
  app.db.run('UPDATE game_identity_links SET expires_at=? WHERE code_hash=?',Date.now()-1,hash(current));
  assert.equal((await request('LINKA','/resume',{code:current})).status,400);
  const valid=await link(a.cookie);
  assert.equal((await request('LINKA','/resume',{code:valid})).status,200);
  assert.equal((await request('LINKA','/resume',{code:valid})).status,400);
});

test('two simultaneous resume requests can consume a link only once',async t=>{
  const {app,request,join,link}=await fixture(t);
  const a=await join(),code=await link(a.cookie);
  const results=await Promise.all([request('LINKA','/resume',{code}),request('LINKA','/resume',{code})]);
  assert.deepEqual(results.map(result=>result.status).sort(),[200,400]);
  assert.equal(app.db.get('SELECT COUNT(*) n FROM game_participant_credentials WHERE participant_id=?',a.body.participant.id).n,2);
  assert.equal(app.db.get('SELECT COUNT(*) n FROM game_participants WHERE event_id=?','LINKA').n,1);
});

test('a failed link transaction rolls back the credential binding and code consumption',async t=>{
  const {app,request,join,link}=await fixture(t);
  const a=await join(),code=await link(a.cookie),destination='mixx_game=rollback-destination';
  app.db.raw.exec("CREATE TEMP TRIGGER fail_link_consumption BEFORE UPDATE OF used_at ON game_identity_links BEGIN SELECT RAISE(ABORT,'injected link failure'); END");
  assert.equal((await request('LINKA','/resume',{code},destination)).status,500);
  assert.equal(app.db.get('SELECT COUNT(*) n FROM game_participant_credentials WHERE credential_hash=?',hash('rollback-destination')).n,0);
  assert.equal(app.db.get('SELECT used_at FROM game_identity_links WHERE code_hash=?',hash(code)).used_at,null);
  app.db.raw.exec('DROP TRIGGER fail_link_consumption');
  const retry=await request('LINKA','/resume',{code},destination);
  assert.equal(retry.status,200);
  assert.equal((await request('LINKA','',undefined,destination)).body.participant.id,a.body.participant.id);
});

test('revoked credentials cannot report successful resume or consume a valid link',async t=>{
  const {app,request,join,link}=await fixture(t);
  const a=await join(),b=await join('LINKB',undefined,'Other event'),code=await link(a.cookie);
  const destinationHash=hash(b.cookie.slice('mixx_game='.length));
  app.db.run('INSERT INTO game_participant_credentials(event_id,credential_hash,participant_id,created_at,revoked_at) VALUES(?,?,?,?,?)','LINKA',destinationHash,a.body.participant.id,Date.now(),Date.now());
  assert.equal((await request('LINKA','/resume',{code},b.cookie)).status,401);
  assert.equal(app.db.get('SELECT used_at FROM game_identity_links WHERE code_hash=?',hash(code)).used_at,null);
  assert.equal((await request('LINKB','',undefined,b.cookie)).body.participant.id,b.body.participant.id);
  assert.equal((await request('LINKA','/join',{name:'Taylor',locationKind:'home'},b.cookie)).status,401);
  const c=await request('LINKA','/resume',{code});
  assert.equal(c.status,200,'the valid code must still work on an eligible device');
  assert.equal(c.body.participant.id,a.body.participant.id);
  app.db.run('UPDATE game_participant_credentials SET revoked_at=? WHERE event_id=? AND credential_hash=?',Date.now(),'LINKA',hash(a.cookie.slice('mixx_game='.length)));
  assert.equal((await request('LINKA','/join',{name:'Taylor',locationKind:'home'},a.cookie)).status,401,'revoking the original credential must not cause a unique-constraint server error on rejoin');
});
