import test from 'node:test';
import assert from 'node:assert/strict';
import {createApplication,configuration} from '../apps/server/app.mjs';
import {hash} from '../apps/server/security.mjs';

async function fixture(t){
  const app=createApplication({config:configuration({NODE_ENV:'test',DB_PATH:':memory:',DEMO_MODE:'true',SIGNUPS_ENABLED:'true',APP_ORIGIN:'http://127.0.0.1',APP_SECRET:'environment-profile-switch-tests-2026'})});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(()=>app.close());
  const base='http://127.0.0.1:'+app.server.address().port;
  async function request(path,body,headers={}){
    const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  async function signup(email){
    const result=await request('/api/auth/signup',{name:'Owner',venueName:email,email,password:'switch-profile-password-2026',type:'other',timezone:'America/Chicago'});
    assert.equal(result.status,201);
    const session=(await request('/api/session',undefined,{Cookie:result.cookie})).body;
    return {venueId:session.venues[0].id,userId:session.user.id,headers:{Cookie:result.cookie,'X-Venue-Id':session.venues[0].id,'X-CSRF-Token':session.csrf}};
  }
  const owner=await signup('owner@switch.test'),other=await signup('other@switch.test');
  app.db.run("UPDATE users SET platform_role='admin' WHERE id=?",owner.userId);
  for(const [id,venueId] of [['target',owner.venueId],['untouched',owner.venueId],['foreign',other.venueId]])app.db.run('INSERT INTO tvs(id,venue_id,name,token_hash,created_at) VALUES(?,?,?,?,?)',id,venueId,id,hash('device-'+id),Date.now());
  app.db.run('INSERT INTO content(id,title,worlds,tags,duration,provider,asset_id,resolution,status,ready,clean,premium_only,sponsor,rights_confirmed,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)','film','Fixture Film','["golf"]','[]',60,'demo','sample',720,'published',1,1,0,0,1,Date.now());
  const mix={mode:'single',worlds:{golf:'normal'},subcategories:{},minutes:180,seed:1};
  const created=await request('/api/admin/environments',{name:'Full Environment',description:'Switching fixture',mix,playbackMode:'full'},owner.headers);
  assert.equal(created.status,201);
  const environmentId=created.body.id;
  assert.equal((await request('/api/admin/environments/'+environmentId+'/publish',{},owner.headers)).status,200);
  for(const tv of ['target','untouched'])assert.equal((await request('/api/tvs/'+tv+'/environment',{environmentId},owner.headers)).status,200);
  async function profile(mode,venue=owner){
    const created=await request('/api/saved-mixxes',{name:mode,mix,playbackMode:mode},venue.headers);
    assert.equal(created.status,201);return created.body.id;
  }
  const manifest=async(tv='target')=>{
    const result=await request('/api/player/manifest',undefined,{Authorization:'Bearer device-'+tv});
    assert.equal(result.status,200);return result.body;
  };
  return {app,request,owner,other,environmentId,profile,manifest};
}

test('explicit saved MIXX selection replaces an environment and preserves all three playback modes',async t=>{
  const {app,request,owner,environmentId,profile,manifest}=await fixture(t);
  for(const mode of ['clean','no-ads','full']){
    assert.equal((await request('/api/tvs/target/environment',{environmentId},owner.headers)).status,200);
    const before=await manifest(),savedMixxId=await profile(mode);
    assert.equal((await request('/api/tvs/target/profile',{savedMixxId},owner.headers)).status,200);
    const after=await manifest();
    assert.equal(after.environmentId,null,'the active environment must not shadow the newly selected profile');
    assert.equal(after.savedMixxId,savedMixxId);
    assert.equal(after.playbackMode,mode);
    assert.equal(after.showQr,mode!=='clean');
    assert.equal(after.showVenuePromotions,mode!=='clean');
    assert.notEqual(after.id,before.id,'the player must receive a new manifest');
    assert.equal(app.db.get('SELECT COUNT(*) n FROM tv_environments WHERE tv_id=?','target').n,0);
    assert.equal((await manifest('untouched')).environmentId,environmentId,'other TVs retain their selection');
  }
});

test('cross-venue and invalid profile attempts leave the active environment untouched',async t=>{
  const {request,owner,other,environmentId,profile,manifest}=await fixture(t);
  const ownProfile=await profile('clean'),foreignProfile=await profile('clean',other);
  assert.equal((await request('/api/tvs/target/profile',{savedMixxId:foreignProfile},owner.headers)).status,404);
  assert.equal((await request('/api/tvs/target/profile',{savedMixxId:'missing'},owner.headers)).status,404);
  assert.equal((await request('/api/tvs/foreign/profile',{savedMixxId:ownProfile},owner.headers)).status,404);
  assert.equal((await manifest()).environmentId,environmentId);
});

test('profile switch failure rolls back both selections, and withdrawal restores the saved fallback',async t=>{
  const {app,request,owner,environmentId,profile,manifest}=await fixture(t);
  const previous=await profile('no-ads'),replacement=await profile('clean');
  assert.equal((await request('/api/tvs/target/profile',{savedMixxId:previous},owner.headers)).status,200);
  assert.equal((await request('/api/tvs/target/environment',{environmentId},owner.headers)).status,200);
  app.db.raw.exec("CREATE TEMP TRIGGER reject_switch BEFORE DELETE ON tv_environments BEGIN SELECT RAISE(ABORT,'injected selection failure'); END");
  assert.equal((await request('/api/tvs/target/profile',{savedMixxId:replacement},owner.headers)).status,500);
  assert.equal(app.db.get('SELECT saved_mixx_id FROM tv_profiles WHERE tv_id=?','target').saved_mixx_id,previous);
  assert.equal((await manifest()).environmentId,environmentId);
  app.db.raw.exec('DROP TRIGGER reject_switch');
  assert.equal((await request('/api/admin/environments/'+environmentId+'/withdraw',{},owner.headers)).status,200);
  const fallback=await manifest();
  assert.equal(fallback.environmentId,null);
  assert.equal(fallback.savedMixxId,previous);
  assert.equal(fallback.playbackMode,'no-ads');
});
