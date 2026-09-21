import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createApplication,configuration} from '../apps/server/app.mjs';
import {hash} from '../apps/server/security.mjs';

async function setup(t){
 const app=createApplication({config:configuration({NODE_ENV:'test',DB_PATH:':memory:',DEMO_MODE:'true',SIGNUPS_ENABLED:'true',APP_ORIGIN:'http://127.0.0.1',APP_SECRET:'guest-picks-and-qr-tests-secret-2026'})});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>app.close());
 const base='http://127.0.0.1:'+app.server.address().port;
 async function request(path,body,headers={}){
  const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
  const data=r.headers.get('content-type')?.includes('application/json')?await r.json():await r.text();
  return {status:r.status,body:data,headers:r.headers,cookie:r.headers.get('set-cookie')?.split(';')[0]};
 }
 const signed=await request('/api/auth/signup',{name:'Host',venueName:'Venue from QR',email:'guest-test@example.test',password:'guest-controls-password-2026',type:'other'});
 const session=(await request('/api/session',undefined,{Cookie:signed.cookie})).body,venue=session.venues[0].id;
 const staff={Cookie:signed.cookie,'X-Venue-Id':venue,'X-CSRF-Token':session.csrf};
 app.db.run("UPDATE users SET platform_role='admin' WHERE id=?",session.user.id);
 app.db.run("UPDATE venues SET qr_code='venue-qr-test' WHERE id=?",venue);
 const created=(await request('/api/admin/games/proof-trials-demo',{},staff)).body;
 app.db.run('INSERT INTO tvs(id,venue_id,name,group_name,token_hash,created_at) VALUES(?,?,?,?,?,?)','guest-qr-tv',venue,'QR TV','Room',hash('guest-qr-token'),Date.now());
 await request('/api/games/'+created.id+'/present',{groupName:'Room'},staff);
 const event=(await request('/api/public/games/PROOF26')).body.event;
 return {app,request,staff,venue,event,match:event.matchups[0],judge:event.judges[0]};
}

test('saved bracket and judge picks are private to the participant and follow linked devices',async t=>{
 const {app,request,staff,event,match,judge}=await setup(t);
 const a=await request('/api/public/games/PROOF26/join',{name:'Alex'}),b=await request('/api/public/games/PROOF26/join',{name:'Blair'});
 await request('/api/games/'+event.id+'/phase',{phase:'predictions',matchupId:match.id,expectedRevision:event.stateRevision},staff);
 for(const [person,entryId] of [[a,match.entryAId],[b,match.entryBId]])for(const kind of ['bracket','judge'])assert.equal((await request('/api/public/games/PROOF26/predict',{matchupId:match.id,entryId,kind,judgeId:judge.id},{Cookie:person.cookie})).status,200);
 const view=async cookie=>(await request('/api/public/games/PROOF26',undefined,cookie?{Cookie:cookie}:{})).body;
 const saved=(await view(a.cookie)).predictions;
 assert.equal(saved.length,2);assert.ok(saved.every(p=>p.entryId===match.entryAId));
 assert.ok((await view(b.cookie)).predictions.every(p=>p.entryId===match.entryBId));
 assert.deepEqual((await view()).predictions,[]);
 const link=(await request('/api/public/games/PROOF26/link-device',{},{Cookie:a.cookie})).body;
 const resumed=await request('/api/public/games/PROOF26/resume',{code:link.code});
 assert.deepEqual((await view(resumed.cookie)).predictions,saved);
 assert.equal((await view(resumed.cookie)).participant.id,a.body.participant.id);
 assert.equal(app.db.get('SELECT COUNT(*) n FROM game_participants').n,2);
 app.db.run('UPDATE game_participant_credentials SET revoked_at=? WHERE credential_hash=?',Date.now(),hash(resumed.cookie.slice('mixx_game='.length)));
 assert.deepEqual((await view(resumed.cookie)).predictions,[]);
 assert.deepEqual((await view(a.cookie)).predictions,saved,'revoking the extra device preserves the original');
});

test('event QR targets the presenting venue, carries no control authority and creates no commerce scan',async t=>{
 const {app,request,staff,venue,event}=await setup(t);
 const state=(await request('/api/player/state',undefined,{Authorization:'Bearer guest-qr-token'})).body;
 assert.equal(state.game.joinUrl,'http://127.0.0.1/games/PROOF26?v=venue-qr-test');
 assert.equal(state.game.joinQrImage,'/game-qr/PROOF26/venue-qr-test.svg');
 const before=app.db.get('SELECT COUNT(*) n FROM qr_links').n;
 const qr=await request(state.game.joinQrImage);assert.equal(qr.status,200);assert.match(qr.headers.get('content-type'),/image\/svg\+xml/);
 // Independent qrcode 8.2 byte-mode, ECC-L, mask-0 reference; 4-module quiet zone.
 const matrix=Array.from({length:29},()=>Array(29).fill('0'));
 for(const [,x,y] of qr.body.matchAll(/M(\d+),(\d+)h1v1h-1z/g))matrix[Number(y)-4][Number(x)-4]='1';
 assert.equal(createHash('sha256').update(matrix.flat().join('')).digest('hex'),'a6aeac72b9687e23a4402a45738cf18fbc2d4431bf241bb21dbf577124a28781');
 assert.equal(app.db.get('SELECT COUNT(*) n FROM qr_links').n,before);
 assert.equal((await request('/game-qr/PROOF26/not-a-venue.svg')).status,404);
 const view=(await request('/api/public/games/PROOF26?v=venue-qr-test')).body;
 assert.deepEqual(view.venue,{id:venue,name:'Venue from QR'});
 const joined=await request('/api/public/games/PROOF26/join',{name:'Venue player',venueCode:'venue-qr-test',venueId:'untrusted-client-id'});
 assert.equal(joined.status,200);
 assert.equal(app.db.get('SELECT venue_id FROM game_participation WHERE participant_id=?',joined.body.participant.id).venue_id,venue);
 assert.equal((await request('/api/games/'+event.id+'/phase',{phase:'complete',expectedRevision:0},{Cookie:joined.cookie})).status,401);
 await request('/api/games/'+event.id+'/stop-presenting',{groupName:'Room'},staff);
 assert.equal((await request(state.game.joinQrImage)).status,404);
 assert.equal((await request('/api/public/games/PROOF26/join',{name:'Late visitor',venueCode:'venue-qr-test'})).status,409);
});

test('event QR honors Clean Screen and QR-off policies and disappears on completion',async t=>{
 const {request,staff,event}=await setup(t);
 const state=async()=>(await request('/api/player/state',undefined,{Authorization:'Bearer guest-qr-token'})).body;
 for(const [playbackMode,showQr,visible] of [['clean',true,false],['full',false,false],['full',true,true]]){
  const saved=await request('/api/saved-mixxes',{name:'QR policy',mix:{mode:'single',worlds:{golf:'normal'},subcategories:{},minutes:30,seed:1},playbackMode,showQr},staff);
  assert.equal(saved.status,201);
  assert.equal((await request('/api/tvs/guest-qr-tv/profile',{savedMixxId:saved.body.id},staff)).status,200);
  assert.equal(!!(await state()).game.joinQrImage,visible);
 }
 await request('/api/games/'+event.id+'/phase',{phase:'complete',expectedRevision:0},staff);
 assert.equal((await state()).game,null);
 assert.equal((await request('/game-qr/PROOF26/venue-qr-test.svg')).status,404);
});
