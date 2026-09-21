import test from 'node:test';
import assert from 'node:assert/strict';
import {createApplication,configuration} from '../apps/server/app.mjs';
import {hash} from '../apps/server/security.mjs';
import {localTime,scheduleTime} from '../apps/server/billboards.mjs';

async function fixture(t){
 const app=createApplication({config:configuration({NODE_ENV:'test',DB_PATH:':memory:',DEMO_MODE:'true',SIGNUPS_ENABLED:'true',APP_ORIGIN:'http://127.0.0.1',APP_SECRET:'billboard-disposable-fixture-secret-2026'})});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());const base='http://127.0.0.1:'+app.server.address().port;
 async function request(path,body,headers={},method=body===undefined?'GET':'POST'){
  const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});
  return {status:r.status,body:(r.headers.get('content-type')||'').includes('json')?await r.json():await r.text(),cookie:r.headers.get('set-cookie')?.split(';')[0],location:r.headers.get('location'),type:r.headers.get('content-type')};
 }
 async function signup(email){const r=await request('/api/auth/signup',{name:'Owner',venueName:email,email,password:'billboard-fixture-password',timezone:'America/Chicago',type:'other'});assert.equal(r.status,201);const s=(await request('/api/session',undefined,{Cookie:r.cookie})).body;return {user:s.user.id,venue:s.venues[0].id,headers:{Cookie:r.cookie,'X-CSRF-Token':s.csrf,'X-Venue-Id':s.venues[0].id}};}
 const a=await signup('a@example.test'),b=await signup('b@example.test');
 for(const [id,venue,group] of [['bar',a.venue,'Bar'],['patio',a.venue,'Patio'],['other',b.venue,'Other']])app.db.run('INSERT INTO tvs(id,venue_id,name,group_name,token_hash,created_at) VALUES(?,?,?,?,?,?)',id,venue,id,group,hash('billboard-'+id),Date.now());
 const body={title:'A new discovery',description:'Ask our team for the story.',qrUrl:'https://example.test/event?detail='+('x'.repeat(200)),templateId:'tasting',groupName:'Bar',startsLocal:localTime(Date.now()-60000,'America/Chicago'),endsLocal:localTime(Date.now()+86400000,'America/Chicago'),expectedRevision:0};
 const create=async(extra={},owner=a)=>{const id=crypto.randomUUID(),r=await request('/api/billboards/'+id,{...body,...extra},owner.headers);assert.equal(r.status,201,JSON.stringify(r.body));return r.body.billboard;};
 const publish=async(row,owner=a)=>{const r=await request('/api/billboards/'+row.id+'/publish',{expectedRevision:row.revision},owner.headers);assert.equal(r.status,200,JSON.stringify(r.body));return r.body.billboard;};
 const state=async(id='bar')=>{const r=await request('/api/player/state',undefined,{Authorization:'Bearer billboard-'+id});assert.equal(r.status,200);return r.body;};
 return {app,request,a,b,body,create,publish,state,base};
}

test('billboards save drafts separately, publish real scheduled state, rotate QR destinations and withdraw without earning money',async t=>{
 const {app,request,a,body,create,publish,state}=await fixture(t);let row=await create();
 assert.equal((await state()).billboard,null);assert.equal(app.db.get('SELECT COUNT(*) n FROM promotions').n,0);
 row=await publish(row);assert.equal(row.status,'published');assert.equal(row.revision,2);assert.equal(row.publishedRevision,2);
 const live=(await state()).billboard;assert.equal(live.title,body.title);assert.ok(live.qrImage.startsWith('data:image/svg+xml'));assert.ok(live.expiresAt<=Date.now()+15000);
 assert.equal((await state('patio')).billboard,null);assert.deepEqual((await state('patio')).promotions,[],'billboards cannot leak through the legacy promotion feed');assert.equal((await state('other')).billboard,null);
 const code=app.db.get('SELECT qr_code FROM venue_billboards WHERE id=?',row.id).qr_code;
 const link=await request('/b/'+code);assert.equal(link.status,302);assert.equal(link.location,body.qrUrl);
 const edited=await request('/api/billboards/'+row.id,{...body,title:'Saved but not published',qrUrl:'https://example.test/next',expectedRevision:row.revision},a.headers);assert.equal(edited.status,200);row=edited.body.billboard;
 assert.equal((await state()).billboard.title,body.title);assert.equal((await request('/b/'+code)).location,body.qrUrl);
 assert.equal((await request('/api/billboards/'+row.id+'/publish',{expectedRevision:2},a.headers)).status,409);
 row=await publish(row);assert.equal((await state()).billboard.title,'Saved but not published');assert.equal((await request('/b/'+code)).status,404);
 const currentCode=app.db.get('SELECT qr_code FROM venue_billboards WHERE id=?',row.id).qr_code;
 assert.equal((await request('/b/'+currentCode)).location,'https://example.test/next');
 assert.equal((await request('/api/billboards/'+row.id+'/withdraw',{expectedRevision:row.revision},a.headers)).status,200);
 assert.equal((await state()).billboard,null);assert.equal((await request('/b/'+currentCode)).status,404);
 assert.equal(app.db.get('SELECT COUNT(*) n FROM promotions').n,1,'updates reuse the existing promotion');
 for(const table of ['scans','ledger','orders','events'])assert.equal(app.db.get('SELECT COUNT(*) n FROM '+table).n,0,'no fabricated '+table);
});

test('draft, publish and withdrawal enforce venue ownership, roles, CSRF, revision and valid group selection',async t=>{
 const {app,request,a,b,body,create}=await fixture(t),row=await create(),path='/api/billboards/'+row.id;
 assert.equal((await request('/api/billboards')).status,401);
 for(const suffix of ['', '/publish','/withdraw'])assert.equal((await request(path+suffix,{...body,expectedRevision:row.revision},b.headers)).status,404);
 assert.equal((await request(path,{...body,expectedRevision:row.revision},{...a.headers,'X-CSRF-Token':''})).status,403);
 assert.equal((await request('/api/billboards/'+crypto.randomUUID(),{...body,groupName:'Other'},a.headers)).status,400);
 app.db.run("INSERT INTO members VALUES(?,?,'viewer')",a.venue,b.user);const viewer={...b.headers,'X-Venue-Id':a.venue};
 assert.equal((await request('/api/billboards',undefined,viewer)).body.canEdit,false);
 assert.equal((await request(path+'/publish',{expectedRevision:row.revision},viewer)).status,403);
 app.db.run("UPDATE members SET role='manager' WHERE venue_id=? AND user_id=?",a.venue,b.user);
 assert.equal((await request(path+'/publish',{expectedRevision:row.revision},viewer)).status,200);
 assert.equal((await request(path,{...body,expectedRevision:row.revision},a.headers)).status,409);
 assert.equal((await request(path+'/withdraw',{expectedRevision:row.revision},a.headers)).status,409);
 const promotion=app.db.get('SELECT promotion_id FROM venue_billboards WHERE id=?',row.id).promotion_id;
 assert.equal((await request('/api/promotions/'+promotion,{},a.headers,'DELETE')).status,409,'legacy stop cannot bypass billboard revision checks');
 app.db.run("UPDATE tvs SET revoked=1 WHERE id='bar'");assert.equal((await request('/api/player/state',undefined,{Authorization:'Bearer billboard-bar'})).status,401);
});

test('player eligibility honors time windows, group priority, Clean Screen, QR-off and promotion preferences',async t=>{
 const {app,request,a,create,publish,state}=await fixture(t);
 const group=await publish(await create({title:'Group selection'}));
 await publish(await create({title:'Whole venue',groupName:''}));
 assert.equal((await state()).billboard.title,'Group selection');assert.equal((await state('patio')).billboard.title,'Whole venue');
 const future=await publish(await create({title:'Future',startsLocal:localTime(Date.now()+3600000,'America/Chicago'),endsLocal:localTime(Date.now()+7200000,'America/Chicago')}));assert.equal(future.status,'scheduled');assert.equal((await state()).billboard.title,'Group selection');
 let profile=await request('/api/saved-mixxes',{name:'Billboard policy',mix:{mode:'single',worlds:{golf:'normal'},subcategories:{},minutes:180,seed:1},playbackMode:'no-ads',showQr:false},a.headers);assert.equal(profile.status,201);
 await request('/api/tvs/bar/profile',{savedMixxId:profile.body.id},a.headers);
 assert.equal((await state()).billboard.title,'Group selection','No Ads retains own venue promotions');assert.equal((await state()).billboard.qrImage,undefined);
 app.db.run("UPDATE saved_mixxes SET show_venue_promotions=0 WHERE id=?",profile.body.id);assert.equal((await state()).billboard,null);
 app.db.run("UPDATE saved_mixxes SET show_venue_promotions=1,show_qr=1,playback_mode='clean' WHERE id=?",profile.body.id);assert.equal((await state()).billboard,null);
 app.db.run("UPDATE saved_mixxes SET playback_mode='full' WHERE id=?",profile.body.id);
 const oldCode=app.db.get('SELECT qr_code FROM venue_billboards WHERE id=?',group.id).qr_code;
 app.db.run('UPDATE promotions SET ends_at=? WHERE id=(SELECT promotion_id FROM venue_billboards WHERE id=?)',Date.now()-1,group.id);
 assert.equal((await state()).billboard.title,'Whole venue');assert.equal((await request('/b/'+oldCode)).status,404);
 app.db.run("UPDATE tvs SET group_name='Changed' WHERE id='bar'");assert.equal((await state()).billboard.title,'Whole venue');
 assert.equal((await request('/api/billboards/'+group.id+'/publish',{expectedRevision:group.revision},a.headers)).status,400,'removed TV group must be reviewed');
});

test('publication and audit commit together; concurrent stale publications have one winner',async t=>{
 const {app,request,a,create}=await fixture(t),row=await create(),path='/api/billboards/'+row.id+'/publish';
 app.db.raw.exec("CREATE TRIGGER reject_billboard_publish BEFORE INSERT ON audit WHEN NEW.action='billboard.published' BEGIN SELECT RAISE(ABORT,'billboard rollback probe'); END;");
 assert.equal((await request(path,{expectedRevision:1},a.headers)).status,500);
 assert.equal(app.db.get('SELECT COUNT(*) n FROM promotions').n,0);assert.equal(app.db.get('SELECT revision FROM venue_billboards WHERE id=?',row.id).revision,1);
 app.db.raw.exec('DROP TRIGGER reject_billboard_publish');
 const results=await Promise.all([request(path,{expectedRevision:1},a.headers),request(path,{expectedRevision:1},a.headers)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 assert.equal(app.db.get('SELECT COUNT(*) n FROM promotions').n,1);assert.equal(app.db.get("SELECT COUNT(*) n FROM audit WHERE action='billboard.published'").n,1);
});

test('named venue time zones reject ambiguous/missing wall times and preserve valid schedule instants',()=>{
 assert.equal(scheduleTime('2026-07-01T12:00','America/Chicago'),Date.parse('2026-07-01T17:00:00Z'));
 assert.equal(scheduleTime('2026-12-01T12:00','America/Chicago'),Date.parse('2026-12-01T18:00:00Z'));
 assert.equal(scheduleTime('2026-07-01T12:00','Asia/Kathmandu'),Date.parse('2026-07-01T06:15:00Z'));
 for(const value of ['2026-03-08T02:30','2026-11-01T01:30','2026-02-30T12:00','2026-01-01T24:30'])assert.throws(()=>scheduleTime(value,'America/Chicago'),e=>e.status===400);
});

test('invalid destinations/schedules cannot publish and only declared billboard assets are public',async t=>{
 const {request,a,body,create,publish}=await fixture(t);
 for(const qrUrl of ['javascript:alert(1)','data:text/html,x','http://example.test','https://user:secret@example.test'])assert.equal((await request('/api/billboards/'+crypto.randomUUID(),{...body,qrUrl},a.headers)).status,400);
 const expired=await create({startsLocal:'2020-01-01T12:00',endsLocal:'2020-01-02T12:00'});assert.equal((await request('/api/billboards/'+expired.id+'/publish',{expectedRevision:1},a.headers)).status,400);
 const blank=await publish(await create({qrUrl:''}));assert.equal(blank.published.qrUrl,'');
 for(const path of ['/billboards.mjs','/player/billboards.mjs']){const r=await request(path);assert.equal(r.status,200);assert.match(r.type,/javascript/);}
 for(const path of ['/billboards.css','/player/billboards.css']){const r=await request(path);assert.equal(r.status,200);assert.match(r.type,/text\/css/);}
 assert.equal((await request('/apps/server/billboards.mjs')).status,404);
});


test('game presentation suppresses a published billboard only on the selected TVs and stopping restores it',async t=>{
 const {app,request,a,create,publish,state}=await fixture(t);await publish(await create({groupName:''}));
 app.db.run("UPDATE users SET platform_role='admin' WHERE id=?",a.user);
 const game=await request('/api/admin/games/proof-trials-demo',{},a.headers);assert.equal(game.status,201);
 assert.equal((await request('/api/games/'+game.body.id+'/present',{groupName:'Bar'},a.headers)).status,200);
 const presented=await state();assert.equal(presented.game.id,game.body.id);assert.equal(presented.billboard,null);
 assert.equal((await state('patio')).billboard.title,'A new discovery');
 assert.equal((await request('/api/games/'+game.body.id+'/stop-presenting',{groupName:'Bar'},a.headers)).status,200);
 assert.equal((await state()).game,null);assert.equal((await state()).billboard.title,'A new discovery');
});
