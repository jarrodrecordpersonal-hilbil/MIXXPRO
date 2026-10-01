import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createOpenBlendingPreview} from '../apps/server/blending-open-preview.mjs';
import {createApplication,configuration} from '../apps/server/app.mjs';

async function fixture(t, extra = {}) {
  const app=createOpenBlendingPreview({BLENDING_OPEN_PREVIEW:'true',NODE_ENV:'test',...extra});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  t.after(()=>app.close());
  const base='http://127.0.0.1:'+app.server.address().port;
  app.config.APP_ORIGIN=base;
  let csrf;
  async function request(path, body, headers = {}) {
    const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Origin:base,'Content-Type':'application/json',...(csrf?{'X-CSRF-Token':csrf}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
    const type=response.headers.get('content-type')||'';
    return {status:response.status,headers:response.headers,body:type.includes('application/json')?await response.json():await response.text()};
  }
  async function metadata(){const result=await request('/api/open-preview');csrf=result.body.csrf;return result.body;}
  await metadata();
  const host=async()=> (await request('/api/admin/blending/seasons/TRYBG')).body;
  const season=async()=> (await request('/api/public/blending/TRYBG')).body;
  const advance=async(action)=>{const batch=(await host()).batches.find(b=>b.event);return request('/api/admin/blending/batches/'+batch.id+'/advance',{action,seconds:120,expectedRevision:batch.event.stateRevision});};
  return {app,base,request,metadata,host,season,advance};
}

test('open preview requires explicit opt-in and an HTTPS origin when hosted',()=>{
  assert.throws(()=>createOpenBlendingPreview({}),/explicit/);
  assert.throws(()=>createOpenBlendingPreview({BLENDING_OPEN_PREVIEW:'false'}),/explicit/);
  for(const origin of ['http://localhost:3000','https://example.test/path','https://user:pass@example.test','ftp://example.test'])
    assert.throws(()=>createOpenBlendingPreview({BLENDING_OPEN_PREVIEW:'true',NODE_ENV:'production',APP_ORIGIN:origin}));
});

test('open preview ignores existing database and integration credentials; no admin cookie leaves the server',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'open-preview-safety-')),path=join(directory,'production.sqlite');
  const sentinel='Not a SQLite database. This existing file must never be opened or changed.';
  writeFileSync(path,sentinel);t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const f=await fixture(t,{DB_PATH:path,STRIPE_SECRET_KEY:'must-not-inherit',BUNNY_API_KEY:'must-not-inherit',APP_SECRET:'must-not-inherit'});
  assert.equal(f.app.config.DB_PATH,':memory:');
  assert.equal(f.app.config.STRIPE_SECRET_KEY,undefined);assert.equal(f.app.config.BUNNY_API_KEY,undefined);
  assert.notEqual(f.app.config.APP_SECRET,'must-not-inherit');assert.equal(readFileSync(path,'utf8'),sentinel);
  const response=await f.request('/api/public/blending/TRYBG');assert.equal(response.headers.get('set-cookie'),null);
  assert.equal(response.body.account.signedIn,true);assert.equal(response.body.openPreview,true);
});

test('anonymous visitors get seeded judge, producer and team screens without a login',async t=>{
  const f=await fixture(t),s=await f.season(),h=await f.host();
  assert.equal(s.season.isTest,true);assert.equal(s.canManage,true);assert.equal(s.intake.name,'Round 1 · Next judging flight');
  assert.equal(h.batches.find(b=>b.event).entries.length,6);
  assert.equal((await f.request('/api/blending/judging')).body.tasks.length,1);
  const page=await f.request('/blending/TRYBG');assert.equal(page.status,200);assert.equal(page.headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
});

test('anonymous users may switch demo judges and write only their selected scorecard',async t=>{
  const f=await fixture(t);
  const task1=(await f.request('/api/blending/judging',undefined,{'X-Preview-Judge':'1'})).body.tasks[0];
  const task2=(await f.request('/api/blending/judging',undefined,{'X-Preview-Judge':'2'})).body.tasks[0];
  assert.notEqual(task1.judgeId,task2.judgeId);
  const card=task1.cards[0],body={batchId:task1.batchId,entryId:card.entryId,aroma:15,palate:21,balance:23,finish:23,notes:'Example edit',expectedRevision:card.revision,lock:true};
  assert.equal((await f.request('/api/blending/judging/score',body,{'X-Preview-Judge':'1'})).status,200);
  const updated=(await f.request('/api/blending/judging',undefined,{'X-Preview-Judge':'1'})).body.tasks[0].cards.find(c=>c.entryId===card.entryId);
  const untouched=(await f.request('/api/blending/judging',undefined,{'X-Preview-Judge':'2'})).body.tasks[0].cards.find(c=>c.entryId===card.entryId);
  assert.ok(updated.lockedAt);assert.equal(updated.aroma,15);assert.equal(untouched.lockedAt,null);
  assert.equal((await f.request('/api/blending/judging/score',{...body,expectedRevision:updated.revision}, {'X-Preview-Judge':'1'})).status,409);
  assert.equal((await f.request('/api/blending/judging',undefined,{'X-Preview-Judge':'unknown'})).status,400);
});

test('preview producer can lock fictional draft cards and reveal results with normal prediction locks',async t=>{
  const f=await fixture(t);
  assert.equal((await f.advance('open')).status,200);
  assert.equal((await f.advance('reveal')).status,409);
  const lock=await f.request('/api/open-preview/lock-scores',{});assert.equal(lock.status,200);assert.equal(lock.body.locked,18);
  assert.equal((await f.advance('close')).status,200);assert.equal((await f.advance('reveal')).status,200);
  const s=await f.season();assert.equal(s.batches.find(b=>b.eventCode).results.length,2);
});

test('no-login team entry submits to the next eligible flight, not the one already prepared',async t=>{
  const f=await fixture(t),s=await f.season(),recipe=s.season.components.map(c=>({code:c.code,bps:2500}));
  const made=await f.request('/api/public/blending/TRYBG/entries',{teamName:'Example seventh team',blendName:'Example reserve',recipe,age21:true,expectedTarget:s.intake.key});
  assert.equal(made.status,201);
  const saved=await f.request('/api/public/blending/TRYBG/entries/'+made.body.recipeId,{blendName:'Example reserve',recipe,expectedRevision:0,submit:true,expectedTarget:s.intake.key});
  assert.equal(saved.status,200);assert.equal(saved.body.destination.batchId,s.intake.batchId);
  assert.equal((await f.season()).myEntries[0].status,'submitted');
});

test('guest viewers remain distinct despite no-login producer access and preserve late-join picks',async t=>{
  const f=await fixture(t);await f.advance('open');
  const a=await f.request('/api/public/games/BGDEMO/join',{name:'Viewer A'});
  const b=await f.request('/api/public/games/BGDEMO/join',{name:'Viewer B'});
  assert.notEqual(a.body.participant.id,b.body.participant.id);
  const cookie=a.headers.get('set-cookie').split(';')[0];
  const data=(await f.request('/api/public/games/BGDEMO',undefined,{Cookie:cookie})).body;
  assert.equal(data.account.enabled,false);assert.equal(data.account.signedIn,false);assert.equal(data.openPreview,true);
  const matchup=data.event.matchups.find(m=>m.id===data.event.activeMatchupId);
  assert.equal((await f.request('/api/public/games/BGDEMO/predict',{matchupId:matchup.id,entryId:matchup.entryAId},{Cookie:cookie})).status,200);
  await f.request('/api/open-preview/lock-scores',{});await f.advance('close');await f.advance('reveal');
  const late=await f.request('/api/public/games/BGDEMO/join',{name:'Late viewer'});assert.equal(late.status,200);
  await f.advance('open');
  const reload=(await f.request('/api/public/games/BGDEMO',undefined,{Cookie:cookie})).body;
  assert.equal(reload.participant.id,a.body.participant.id);assert.equal(reload.predictions.length,1);
  assert.equal((await f.request('/api/public/games/BGDEMO/predict',{matchupId:matchup.id,entryId:matchup.entryBId},{Cookie:cookie})).status,409);
});

test('unrelated account, admin, venue, provider and filesystem routes remain unavailable',async t=>{
  const f=await fixture(t);
  for(const path of ['/api/admin/users','/api/auth/signup','/api/auth/login','/api/public/game-account/register','/api/hooks/stripe','/api/games/test/phase','/api/admin/games/test/publish-outcome','/api/player/pair','/api/preview/admin'])
    assert.equal((await f.request(path,{})).status,404,path);
  for(const path of ['/admin','/api/session','/api/config','/api/screen-activity','/player/','/.env','/blending/../admin','/api/admin/blending/seasons/TRYBG/other'])
    assert.equal((await f.request(path)).status,404,path);
});

test('preview mutations reject cross-origin requests and stale or missing CSRF',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request('/api/open-preview/lock-scores',{}, {Origin:'https://elsewhere.test'})).status,403);
  assert.equal((await f.request('/api/open-preview/lock-scores',{}, {'X-CSRF-Token':''})).status,403);
  assert.equal((await f.request('/api/open-preview/reset',{}, {Origin:''})).status,403);
  const t1=(await f.request('/api/blending/judging')).body.tasks[0],card=t1.cards[0];
  assert.equal((await f.request('/api/blending/judging/score',{batchId:t1.batchId,entryId:card.entryId,aroma:20,palate:20,balance:20,finish:20,notes:'',expectedRevision:0}, {'X-CSRF-Token':''})).status,403);
});

test('reset clears shared test actions, rotates ephemeral principals and never reuses a locked card',async t=>{
  const f=await fixture(t),before=await f.metadata();
  await f.request('/api/open-preview/lock-scores',{});await f.advance('open');
  assert.equal((await f.request('/api/open-preview/reset',{})).status,200);
  const after=await f.metadata();assert.notEqual(after.csrf,before.csrf);assert.equal(after.generation,before.generation+1);
  const tasks=(await f.request('/api/blending/judging')).body.tasks;
  assert.ok(tasks[0].cards.every(c=>c.lockedAt===null));
  assert.equal((await f.host()).batches.find(b=>b.event).event.phase,'lobby');
  assert.equal((await f.request('/api/open-preview/reset',{}, {'X-CSRF-Token':before.csrf})).status,403);
});

test('normal application still requires real judge/admin sessions and exposes no open-preview endpoint',async t=>{
  const app=createApplication({config:configuration({NODE_ENV:'test',DB_PATH:':memory:',BLENDING_GAMES_ENABLED:'true',GAME_ACCOUNTS_ENABLED:'true'})});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());
  const base='http://127.0.0.1:'+app.server.address().port;
  assert.equal((await fetch(base+'/api/open-preview')).status,404);
  assert.equal((await fetch(base+'/api/blending/judging')).status,401);
  assert.equal((await fetch(base+'/api/admin/blending/seasons/TRYBG')).status,401);
  assert.equal(app.db.get('SELECT COUNT(*) n FROM users').n,0);
});
