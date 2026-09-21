import test from 'node:test';
import assert from 'node:assert/strict';
import {createApplication,configuration} from '../apps/server/app.mjs';
import {hash} from '../apps/server/security.mjs';

async function fixture(t){
  const app=createApplication({config:configuration({NODE_ENV:'test',DB_PATH:':memory:',DEMO_MODE:'true',SIGNUPS_ENABLED:'true',APP_ORIGIN:'http://127.0.0.1',APP_SECRET:'curator-workflow-isolated-tests-2026'})});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>app.close());
  const base='http://127.0.0.1:'+app.server.address().port;
  async function request(path,body,headers={},method=body===undefined?'GET':'POST'){
    const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
  }
  async function signup(email){
    const r=await request('/api/auth/signup',{name:'Fixture',venueName:email,email,password:'curator-fixture-password',type:'other'});
    assert.equal(r.status,201);const s=(await request('/api/session',undefined,{Cookie:r.cookie})).body;
    return {userId:s.user.id,venueId:s.venues[0].id,headers:{Cookie:r.cookie,'X-CSRF-Token':s.csrf,'X-Venue-Id':s.venues[0].id}};
  }
  const curator=await signup('curator@example.test'),staff=await signup('staff@example.test');
  app.db.run("UPDATE users SET platform_role='admin' WHERE id=?",curator.userId);
  app.db.run('INSERT INTO tvs(id,venue_id,name,token_hash,created_at) VALUES(?,?,?,?,?)','screen',curator.venueId,'Preview screen',hash('curator-test-screen'),Date.now());
  const time=Date.now();
  for(const [id,sponsor] of [['film',0],['advert',1]])app.db.run('INSERT INTO content(id,title,worlds,tags,duration,provider,asset_id,status,ready,clean,sponsor,rights_confirmed,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',id,id,'["golf"]','[]',sponsor?30:600,'demo','sample','published',1,1,sponsor,1,time);
  app.db.run('INSERT INTO campaigns VALUES(?,?,?,?,?,?,?,?,?)','campaign','brand','Fixture ad','advert','golf','',time-1000,time+86400000,1);
  app.db.run('INSERT INTO venue_creatives(id,venue_id,title,asset_url,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)','promo',curator.venueId,'Venue promo','/icon.svg','ready',time,time);
  const definition={name:'Evening rotation',description:'',mix:{mode:'single',worlds:{golf:'normal'},subcategories:{},minutes:30,seed:1},playbackMode:'full',showQr:true,showVenuePromotions:true};
  const create=async()=>{const r=await request('/api/admin/environments',definition,curator.headers);assert.equal(r.status,201);return r.body;};
  const player=async()=>{const r=await request('/api/player/manifest',undefined,{Authorization:'Bearer curator-test-screen'});assert.equal(r.status,200);return r.body;};
  return {app,request,curator,staff,definition,create,player,base};
}

test('curator preview follows actual player ad/profile policy without issuing manifests or QR links',async t=>{
  const {app,request,curator,definition,create,player}=await fixture(t),environment=await create();
  for(const playbackMode of ['full','no-ads','clean']){
    const stored=app.db.get('SELECT version FROM curated_environments WHERE id=?',environment.id);
    const edit=await request('/api/admin/environments/'+environment.id,{...definition,playbackMode,expectedVersion:stored.version,publish:true},curator.headers,'PATCH');assert.equal(edit.status,200);
    assert.equal((await request('/api/tvs/screen/environment',{environmentId:environment.id},curator.headers)).status,200);
    const before=['manifests','qr_links','tv_environments','audit'].map(table=>app.db.get('SELECT COUNT(*) n FROM '+table).n);
    const preview=await request('/api/admin/environments/preview',{...definition,playbackMode,venueId:curator.venueId},curator.headers);
    assert.equal(preview.status,200);assert.equal(preview.body.preview,true);assert.equal(preview.body.id,null);
    assert.deepEqual(['manifests','qr_links','tv_environments','audit'].map(table=>app.db.get('SELECT COUNT(*) n FROM '+table).n),before);
    assert.ok(preview.body.items.every(item=>!item.qrImage&&!item.qrUrl));
    const actual=await player(),summarize=m=>m.items.map(x=>[x.contentId,x.campaignId,x.venueCreativeId,x.playSeconds]);
    assert.deepEqual(summarize(preview.body),summarize(actual));
    assert.equal(actual.items.some(x=>x.campaignId),playbackMode==='full');
    assert.equal(actual.items.some(x=>x.venueCreativeId),playbackMode!=='clean');
    assert.equal(preview.body.showQr,playbackMode!=='clean');
  }
  const blocked=await request('/api/admin/environments/preview',{...definition,venueId:curator.venueId,blockedBrands:['brand']},curator.headers);
  assert.equal(blocked.status,200);assert.ok(blocked.body.items.every(x=>!x.campaignId));
});

test('live edits require explicit publication, retain assignments and reject stale revisions and withdrawals',async t=>{
  const {app,request,curator,definition,create,player}=await fixture(t),e=await create();
  const published=await request('/api/admin/environments/'+e.id+'/publish',{expectedVersion:1},curator.headers);assert.equal(published.body.version,2);
  await request('/api/tvs/screen/environment',{environmentId:e.id},curator.headers);
  const before=await player();
  const revision={...definition,name:'Late evening',playbackMode:'clean',expectedVersion:2};
  assert.equal((await request('/api/admin/environments/'+e.id,revision,curator.headers,'PATCH')).status,409);
  assert.equal((await player()).id,before.id);
  const edited=await request('/api/admin/environments/'+e.id,{...revision,publish:true},curator.headers,'PATCH');assert.equal(edited.status,200);assert.equal(edited.body.version,3);
  const after=await player();assert.equal(after.environmentId,e.id);assert.equal(after.environmentVersion,3);assert.equal(after.environmentName,'Late evening');assert.equal(after.showQr,false);assert.notEqual(after.id,before.id);
  assert.equal((await request('/api/admin/environments/'+e.id,{...revision,publish:true},curator.headers,'PATCH')).status,409);
  assert.equal((await request('/api/admin/environments/'+e.id+'/withdraw',{expectedVersion:2},curator.headers)).status,409);
  assert.equal((await request('/api/admin/environments/'+e.id,{...definition,publish:true},curator.headers,'PATCH')).status,400);
  assert.equal(app.db.get('SELECT version FROM curated_environments WHERE id=?',e.id).version,3);
});

test('anonymous users, venue staff and brand users cannot read, edit, preview or publish curated programming',async t=>{
  const {app,request,curator,staff,definition,create}=await fixture(t),e=await create();
  const operations=[['/api/admin/environments',undefined,'GET'],['/api/admin/environments',definition,'POST'],['/api/admin/environments/preview',{...definition,venueId:curator.venueId},'POST'],['/api/admin/environments/'+e.id,{...definition,expectedVersion:1},'PATCH'],['/api/admin/environments/'+e.id+'/publish',{},'POST'],['/api/admin/environments/'+e.id+'/withdraw',{},'POST']];
  for(const role of ['anonymous','venue','brand']){
    if(role!=='anonymous')app.db.run('UPDATE users SET platform_role=? WHERE id=?',role,staff.userId);
    for(const [path,body,method] of operations)assert.equal((await request(path,body,role==='anonymous'?{}:staff.headers,method)).status,role==='anonymous'?401:403,role+' '+path);
  }
  assert.equal(app.db.get('SELECT version FROM curated_environments WHERE id=?',e.id).version,1);
});

test('draft edits remain private; failed revision rolls back publication, version and audit',async t=>{
  const {app,request,curator,definition,create}=await fixture(t),e=await create();
  assert.equal((await request('/api/admin/environments/'+e.id,{...definition,name:'Revised draft',expectedVersion:1},curator.headers,'PATCH')).status,200);
  assert.equal((await request('/api/environments',undefined,curator.headers)).body.environments.length,0);
  const before=app.db.get('SELECT * FROM curated_environments WHERE id=?',e.id);
  const count=app.db.get('SELECT COUNT(*) n FROM audit').n;
  app.db.raw.exec("CREATE TEMP TRIGGER fail_environment_audit BEFORE INSERT ON audit WHEN NEW.action='environment.published' BEGIN SELECT RAISE(ABORT,'injected publication failure'); END");
  assert.equal((await request('/api/admin/environments/'+e.id,{...definition,expectedVersion:2,publish:true},curator.headers,'PATCH')).status,500);
  assert.deepEqual(app.db.get('SELECT * FROM curated_environments WHERE id=?',e.id),before);
  assert.equal(app.db.get('SELECT COUNT(*) n FROM audit').n,count);
});

test('curator module is served as JavaScript and preview rejects invalid settings or missing venues',async t=>{
  const {request,curator,definition,base}=await fixture(t);
  const asset=await fetch(base+'/curator-environments.mjs');assert.equal(asset.status,200);assert.match(asset.headers.get('content-type'),/^text\/javascript/);
  for(const change of [{mix:{...definition.mix,worlds:{}}},{blockedBrands:'brand'},{playbackMode:'anything'}])assert.equal((await request('/api/admin/environments/preview',{...definition,venueId:curator.venueId,...change},curator.headers)).status,400);
  assert.equal((await request('/api/admin/environments/preview',{...definition,venueId:'missing'},curator.headers)).status,404);
});
