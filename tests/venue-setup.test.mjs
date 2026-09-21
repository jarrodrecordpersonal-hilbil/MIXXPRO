import test from 'node:test';
import assert from 'node:assert/strict';
import {setupState} from '../apps/web/public/venue-setup.mjs';
import {createApplication,configuration} from '../apps/server/app.mjs';
import {localTime} from '../apps/server/billboards.mjs';

test('setup distinguishes pairing, current playback and publication instead of assuming completion',()=>{
 assert.equal(setupState({tvs:[]}).paired,0);
 const offline=setupState({tvs:[{online:false,playing:1}]});assert.equal(offline.paired,1);assert.equal(offline.playing,0);assert.match(offline.heading,/reconnect/);
 assert.equal(setupState({tvs:[{online:true,playing:0}]}).playing,0);
 const playing=setupState({tvs:[{online:true,playing:1}],billboards:{total:1,published:0,scheduled:0}});assert.equal(playing.playing,1);assert.match(playing.heading,/Make it yours/);
 assert.match(setupState({tvs:[{online:true,playing:1}],billboards:{total:1,published:1,scheduled:1}}).heading,/up and running/);
});

test('venue setup counts only its billboards and distinguishes draft, scheduled, expired and withdrawn publication',async()=>{
 const app=createApplication({config:configuration({DB_PATH:':memory:',SIGNUPS_ENABLED:'true',APP_SECRET:'pilot-setup-only-local-test-secret-2026'})});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${app.server.address().port}`;
 async function request(path,who,body,method){const response=await fetch(base+'/api'+path,{method:method||(body?'POST':'GET'),headers:{...(who?{Cookie:who.cookie,'X-Venue-Id':who.venue,'X-CSRF-Token':who.csrf||''}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json(),headers:response.headers};}
 async function signup(name){const r=await request('/auth/signup',null,{name,email:name+'@example.test',password:'test-setup-password-2026',venueName:name+' venue',type:'other',timezone:'America/Chicago'});assert.equal(r.status,201);const who={cookie:r.headers.get('set-cookie').split(';')[0],venue:r.data.venueId};who.csrf=(await request('/session',who)).data.csrf;return who;}
 try{
  const a=await signup('Alpha'),b=await signup('Beta');
  const state=async who=>(await request('/venue',who)).data.setup.billboards;
  assert.deepEqual(await state(a),{total:0,published:0,scheduled:0});
  const info=(await request('/billboards',a)).data,billboardId=crypto.randomUUID();
  const draft=await request('/billboards/'+billboardId,a,{title:'A future tasting',description:'A test fixture only.',startsLocal:localTime(Date.now()+86400000,info.timeZone),endsLocal:info.defaults.endsLocal,expectedRevision:0});assert.equal(draft.status,201);
  assert.deepEqual(await state(a),{total:1,published:0,scheduled:0});
  const published=await request('/billboards/'+billboardId+'/publish',a,{expectedRevision:draft.data.billboard.revision});assert.equal(published.status,200);
  assert.deepEqual(await state(a),{total:1,published:1,scheduled:1});assert.deepEqual(await state(b),{total:0,published:0,scheduled:0});
  const row=app.db.get('SELECT promotion_id FROM venue_billboards WHERE id=?',billboardId);
  app.db.run('UPDATE promotions SET starts_at=?,ends_at=? WHERE id=?',Date.now()-2000,Date.now()+86400000,row.promotion_id);assert.deepEqual(await state(a),{total:1,published:1,scheduled:0});
  app.db.run('UPDATE promotions SET ends_at=? WHERE id=?',Date.now()-1000,row.promotion_id);assert.deepEqual(await state(a),{total:1,published:0,scheduled:0});
  app.db.run('UPDATE promotions SET ends_at=? WHERE id=?',Date.now()+86400000,row.promotion_id);
  assert.equal((await request('/billboards/'+billboardId+'/withdraw',a,{expectedRevision:published.data.billboard.revision})).status,200);assert.deepEqual(await state(a),{total:1,published:0,scheduled:0});
  assert.equal((await request('/venue',{...b,venue:a.venue})).status,404);assert.equal((await request('/venue',null)).status,401);
 }finally{await app.close();}
});
