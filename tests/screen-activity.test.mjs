import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createApplication,configuration} from '../apps/server/app.mjs';
import {openDatabase} from '../apps/server/db.mjs';
import {hash} from '../apps/server/security.mjs';

let app,base,stamp;
const MIX=JSON.stringify({mode:'single',worlds:{golf:'normal'},minutes:180,subcategories:{},seed:1});
const location={address:'123 Private Venue Street',city:'Springfield',region:'Missouri',postalCode:'65801',country:'US',updatedAt:1};
beforeEach(async()=>{
  app=createApplication({config:configuration({DB_PATH:':memory:',DEMO_MODE:'true',APP_SECRET:'test-only-secret'.repeat(3)})});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+app.server.address().port;app.config.APP_ORIGIN=base;stamp=Date.now();
  for(const [id,role,brand] of [['admin','admin',null],['owner-a','venue',null],['owner-b','venue',null],['viewer','venue',null],['brand','brand','brand-a']]){
    app.db.run('INSERT INTO users(id,email,password_hash,name,platform_role,brand_id,created_at) VALUES(?,?,?,?,?,?,?)',id,id+'@example.test','unused','Tester',role,brand,stamp);
    app.db.run('INSERT INTO sessions VALUES(?,?,?,?)',hash('session-'+id),id,'csrf-'+id,stamp+3600000);
  }
  for(const n of ['a','b']){
    app.db.run('INSERT INTO venues(id,name,type,timezone,mix,qr_code,referral_code,created_at) VALUES(?,?,?,?,?,?,?,?)','venue-'+n,'Venue '+n,'golf','America/Chicago',MIX,'qr-'+n,'ref-'+n,stamp);
    app.db.run('INSERT INTO members VALUES(?,?,?)','venue-'+n,'owner-'+n,'owner');
    app.db.run('INSERT INTO tvs(id,venue_id,name,token_hash,created_at) VALUES(?,?,?,?,?)','tv-'+n,'venue-'+n,'Screen '+n,hash('device-'+n),stamp);
    app.db.run('INSERT INTO content(id,title,worlds,duration,provider,asset_id,status,ready,rights_confirmed,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)','content-'+n,'Film '+n,'["golf"]',20,'demo','sample','published',1,1,stamp);
    app.db.run('INSERT INTO campaigns VALUES(?,?,?,?,?,?,?,?,?)','campaign-'+n,'brand-'+n,'Brand campaign '+n,'content-'+n,'golf','',stamp-86400000,stamp+86400000,1);
    const payload={id:'manifest-'+n,tvId:'tv-'+n,venueName:'Historical venue '+n,tvName:'Historical screen '+n,venueLocation:location,
      items:[{index:0,contentId:'content-'+n,title:'Historical film '+n,world:'golf',campaignId:'campaign-'+n,campaignName:'Historical campaign '+n,brandId:'brand-'+n,duration:20,playSeconds:12,demo:false}]};
    app.db.run('INSERT INTO manifests VALUES(?,?,?,?,?)','manifest-'+n,'tv-'+n,JSON.stringify(payload),stamp+3600000,stamp-3600000);
  }
  app.db.run('INSERT INTO members VALUES(?,?,?)','venue-a','viewer','viewer');
});
afterEach(async()=>app.close());
async function request(path,{user='owner-a',venue='venue-a',body,device}={}){
  const headers=device?{Authorization:'Bearer device-'+device}:{Cookie:'mixx_session=session-'+user,'X-CSRF-Token':'csrf-'+user,'X-Venue-Id':venue};
  if(body)headers['Content-Type']='application/json';headers.Origin=base;
  const r=await fetch(base+'/api'+path,{method:body?(path==='/venue/location'?'PATCH':'POST'):'GET',headers,body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};
}
const event=(extras={},n='a')=>({id:crypto.randomUUID(),playbackId:'play-'+n,manifestId:'manifest-'+n,contentId:'content-'+n,campaignId:'campaign-'+n,itemIndex:0,kind:'tick',seconds:5,occurredAt:stamp-10000,sequence:1,source:'cache',...extras});
async function emit(events,n='a'){const r=await request('/player/events',{device:n,body:{events}});assert.equal(r.status,200,JSON.stringify(r.data));return r.data;}
async function screen(query='',user='owner-a',venue='venue-a'){const r=await request('/screen-activity'+query,{user,venue});assert.equal(r.status,200,JSON.stringify(r.data));return r.data;}

test('screen activity requires a session and protects network/venue scope',async()=>{
  assert.equal((await request('/screen-activity',{user:'missing'})).status,401);
  assert.equal((await request('/screen-activity?scope=network')).status,403);
  assert.equal((await request('/screen-activity',{user:'owner-b'})).status,404);
  assert.equal((await request('/screen-activity?scope=brand')).status,403);
});
test('network report contains both venues; owner and viewer are limited to their venue',async()=>{
  await emit([event()]);await emit([event({},'b')],'b');
  assert.equal((await screen()).summary.screens,1);
  assert.equal((await screen('','viewer')).rows[0].venueId,'venue-a');
  const r=await screen('?scope=network','admin');assert.equal(r.summary.screens,2);assert.equal(r.summary.reportedSeconds,10);
});
test('captures issued film/world/screen/location, never client-supplied location or labels',async()=>{
  await emit([event({venueName:'Injected',city:'Injected',title:'Injected'})]);
  const r=(await screen()).rows[0];assert.equal(r.title,'Historical film a');assert.equal(r.world,'golf');assert.equal(r.tvName,'Historical screen a');assert.equal(r.venueName,'Historical venue a');assert.equal(r.location.city,'Springfield');
});
test('location edit requires write access; history is not rewritten by renaming or moving venue',async()=>{
  assert.equal((await request('/venue/location',{user:'viewer',body:{...location}})).status,403);
  await emit([event()]);
  assert.equal((await request('/venue/location',{body:{city:'St Louis',region:'Missouri',country:'US'}})).status,200);
  app.db.run('UPDATE venues SET name=? WHERE id=?','Renamed venue','venue-a');app.db.run('UPDATE tvs SET name=? WHERE id=?','Renamed TV','tv-a');
  const r=(await screen()).rows[0];assert.equal(r.location.city,'Springfield');assert.equal(r.tvName,'Historical screen a');assert.equal(r.venueName,'Historical venue a');
});
test('new server manifests include venue-provided location and current TV name',async()=>{
  await request('/venue/location',{body:{...location}});
  const r=await request('/player/manifest',{device:'a'});assert.equal(r.status,200);assert.equal(r.data.venueLocation.city,'Springfield');assert.equal(r.data.tvName,'Screen a');
});
test('start-only records add no playback seconds or inferred live viewers',async()=>{
  await emit([event({kind:'start',seconds:0})]);const r=await screen();assert.equal(r.summary.reportedSeconds,0);assert.equal(r.summary.playsWithProgress,0);assert.equal(r.rows[0].outcome,'start only');assert.equal(r.audienceDwell,null);
});
test('duration capped to exact issued clip slot, not full asset length',async()=>{
  await emit([event({seconds:10}),event({sequence:2,seconds:10,occurredAt:stamp-1000}),event({kind:'complete',seconds:0,sequence:3,occurredAt:stamp})]);
  const r=await screen();assert.equal(r.summary.reportedSeconds,12);assert.equal(r.rows[0].plannedSeconds,12);assert.equal(r.rows[0].outcome,'ended');assert.equal(r.rows[0].endedAt,stamp);
});
test('event IDs and new player sequences deduplicate; foreign duplicate IDs are not accepted',async()=>{
  const e=event();await emit([e]);const retry=await emit([e]);assert.deepEqual(retry.accepted,[e.id]);
  assert.equal((await emit([event()])).rejected[0].reason,'duplicate_sequence');
  assert.equal((await emit([{...event({},'b'),id:e.id}],'b')).accepted.length,0);
  assert.equal((await screen()).summary.events,1);
});
test('same playback cannot be rebound to another issued film or manifest',async()=>{
  await emit([event()]);
  const payload=JSON.parse(app.db.get('SELECT payload FROM manifests WHERE id=?','manifest-a').payload);
  app.db.run('INSERT INTO manifests VALUES(?,?,?,?,?)','another','tv-a',JSON.stringify(payload),stamp+3600000,stamp-100000);
  const bad=await emit([event({manifestId:'another',sequence:2})]);assert.equal(bad.rejected[0].reason,'playback_context_changed');
});
test('cache and network seconds reflect playback source, not billable bytes',async()=>{
  await emit([event({source:'cache'}),event({source:'network',sequence:2,occurredAt:stamp-3000})]);
  const r=(await screen()).rows[0];assert.equal(r.cachedSeconds,5);assert.equal(r.networkSeconds,5);
});
test('offline arrival tracked separately from occurrence time',async()=>{
  await emit([event({occurredAt:stamp-120000})]);const r=await screen();assert.equal(r.summary.delayedEvents,1);assert.ok(r.rows[0].lastReceivedAt>r.rows[0].lastEventAt);
});
test('UTC windows are half-open and report duration is bounded to 31 days',async()=>{
  await emit([event()]);
  const at=stamp-10000;assert.equal((await screen(`?from=${at}&to=${at+1}`)).summary.events,1);
  assert.equal((await screen(`?from=${at-1}&to=${at}`)).summary.events,0);
  assert.equal((await request(`/screen-activity?from=${stamp-32*86400000}&to=${stamp}`)).status,400);
  assert.equal((await request('/screen-activity?limit=10000')).status,400);
});
test('title, location, world, TV and campaign filters do not widen tenant scope',async()=>{
  await emit([event()]);await emit([event({},'b')],'b');
  const r=await screen('?city=Springfield&region=missouri&world=golf&q=Historical&tvId=tv-a&campaignId=campaign-a');assert.equal(r.summary.reportedSeconds,5);
  assert.equal((await screen('?venueId=venue-b')).total,0);
  assert.equal((await screen('?world=travel')).total,0);
  assert.equal((await screen('?q=%25')).total,0);
});
test('brands see only their campaigns and never street/postal details',async()=>{
  await emit([event()]);await emit([event({},'b')],'b');const r=await screen('?scope=brand','brand');
  assert.equal(r.total,1);assert.equal(r.rows[0].campaignId,'campaign-a');assert.equal(r.rows[0].location.address,undefined);assert.equal(r.rows[0].location.postalCode,undefined);
  assert.ok(!JSON.stringify(r).includes('123 Private Venue Street'));
  const raw=await request('/screen-activity/events?scope=brand',{user:'brand'});assert.equal(raw.status,200);assert.equal(raw.data.rows.length,1);assert.equal(raw.data.rows[0].location.address,undefined);
});
test('raw events paginate with an asOf boundary and deterministic cursor',async()=>{
  await emit([event(),event({sequence:2,occurredAt:stamp-5000})]);
  const first=await request('/screen-activity/events?limit=1');assert.equal(first.data.rows.length,1);assert.ok(first.data.nextCursor);
  const next=await request('/screen-activity/events?'+new URLSearchParams({limit:'1',cursor:first.data.nextCursor,from:String(first.data.from),to:String(first.data.to),asOf:String(first.data.asOf)}));
  assert.equal(next.data.rows.length,1);assert.notEqual(first.data.rows[0].eventId,next.data.rows[0].eventId);assert.equal(next.data.nextCursor,null);
  assert.equal((await request('/screen-activity/events?cursor=invalid')).status,400);
});
test('report pagination does not truncate network summary',async()=>{
  await emit([event()]);await emit([event({},'b')],'b');const r=await screen('?scope=network&limit=1','admin');
  assert.equal(r.rows.length,1);assert.equal(r.total,2);assert.equal(r.summary.reportedSeconds,10);assert.equal(r.hasMore,true);
});
test('legacy records remain visible with unknown location and marked current names',async()=>{
  const e=event();app.db.run('INSERT INTO events(id,tv_id,manifest_id,content_id,campaign_id,playback_id,kind,seconds,occurred_at,received_at) VALUES(?,?,?,?,?,?,?,?,?,?)',e.id,'tv-a',e.manifestId,e.contentId,e.campaignId,e.playbackId,'tick',3,e.occurredAt,stamp);
  const r=await screen();assert.equal(r.summary.reportedSeconds,3);assert.equal(r.rows[0].location,null);assert.equal(r.rows[0].metadataSnapshot,0);assert.equal(r.rows[0].tvName,'Screen a');assert.equal(r.summary.legacyRows,1);
});
test('unknown/malformed telemetry is rejected without breaking the whole batch',async()=>{
  const result=await emit([null,event({source:'camera'}),event({sequence:-1}),event({seconds:31}),event({itemIndex:500}),event()]);
  assert.equal(result.rejected.length,5);assert.equal(result.accepted.length,1);
});
test('location validation and options preserve tenant boundaries',async()=>{
  assert.equal((await request('/venue/location',{body:{city:'Missing region'}})).status,400);
  const o=(await request('/screen-activity/options')).data;assert.equal(o.venues.length,1);assert.equal(o.tvs[0].id,'tv-a');
  const b=(await request('/screen-activity/options?scope=brand',{user:'brand'})).data;assert.equal(b.canEditLocation,false);assert.equal(b.location,null);
});
test('schema upgrades are additive and idempotent on existing v1 database',()=>{
  const dir=mkdtempSync(join(tmpdir(),'mixx-schema-')),path=join(dir,'old.sqlite');
  try{
    const old=new DatabaseSync(path);old.exec(readFileSync(new URL('../packages/db/migrations/001_pilot.sql',import.meta.url),'utf8'));
    old.prepare('INSERT INTO users(id,email,password_hash,name,created_at) VALUES(?,?,?,?,?)').run('historical','old@example.test','unused','Old account',1);old.close();
    for(let i=0;i<2;i++){const db=openDatabase(path);assert.ok(db.get('SELECT id FROM users WHERE id=?','historical'));assert.equal(db.get('SELECT COUNT(*) n FROM migrations WHERE version=2').n,1);assert.ok(db.all('PRAGMA table_info(events)').some(c=>c.name==='delivery_source'));db.close();}
  }finally{rmSync(dir,{recursive:true,force:true});}
});
