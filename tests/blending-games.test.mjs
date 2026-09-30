import test from 'node:test';
import assert from 'node:assert/strict';
import {blendingFixture} from './helpers/blending.mjs';
import {scoreRows} from '../apps/server/game-standings.mjs';

const contains = (object, value) => JSON.stringify(object).includes(value);

test('blending pages and assets are served with strict CSP and real MIME types', async t => {
  const f = await blendingFixture(t,{teams:0});
  for (const [path,mime] of [['/blending','text/html'],['/blending/BLEND26','text/html'],['/blending.mjs','text/javascript'],['/blending.css','text/css'],['/blending-qr/BLEND26.svg','image/svg+xml']]) {
    const result = await f.request(path); assert.equal(result.status,200); assert.ok(result.headers.get('content-type').includes(mime));
    assert.ok(!result.headers.get('content-security-policy').includes('unsafe-inline'));
  }
  assert.equal((await f.view()).body.season.isTest,true);
  f.app.config.DEMO_MODE=false; f.app.config.BLENDING_GAMES_ENABLED=false;
  assert.equal((await f.view()).status,404);
});

test('producer routes require admin and CSRF; independent judges do not need venue membership', async t => {
  const f = await blendingFixture(t,{teams:2}); await f.prepare();
  const path='/api/admin/blending/seasons/BLEND26';
  assert.equal((await f.request(path)).status,401);
  assert.equal((await f.request(path,undefined,f.teams[0])).status,403);
  assert.equal((await f.request(path+'/configure',{},f.producer,{'X-CSRF-Token':''})).status,403);
  assert.equal((await f.request('/api/blending/judging',undefined,f.judges[0])).body.tasks.length,1);
  assert.equal((await f.request('/api/blending/judging',undefined,f.teams[0])).body.tasks.length,0);
});

test('new teams enter the next flight while another flight is already playing', async t => {
  const f = await blendingFixture(t); const event=await f.prepare();
  assert.equal((await f.advance('open')).status,200);
  const newcomer=f.makeUser('Team Seven'), before=await f.view(newcomer);
  assert.equal(before.body.intake.batchId,f.second);
  assert.equal(before.body.spotlight.code,event.code);
  const entryId=await f.enter(newcomer);
  assert.equal(f.app.db.get('SELECT batch_id FROM blend_recipes WHERE id=?',entryId).batch_id,f.second);
  assert.equal(f.app.db.get('SELECT COUNT(*) n FROM blend_teams').n,7);
});

test('recipe draft reload and account login preserve one entry; wrong owner cannot edit', async t => {
  const f = await blendingFixture(t,{teams:0}), owner=f.makeUser('Home Team'), intruder=f.makeUser('Other Team');
  const recipeId=await f.enter(owner,'Secret team','Secret recipe',false);
  assert.equal((await f.view(owner)).body.myEntries[0].id,recipeId);
  assert.equal((await f.view(intruder)).body.myEntries.length,0);
  assert.equal((await f.request('/api/public/blending/BLEND26/entries/'+recipeId,{blendName:'Stolen',recipe:f.recipe,expectedRevision:0},intruder)).status,404);
  const login=await f.request('/api/public/game-account/login',{email:owner.email,password:owner.password});
  assert.equal(login.status,200);
  assert.equal((await f.view({Cookie:login.cookie})).body.myEntries[0].id,recipeId);
  const duplicate=await f.request('/api/public/blending/BLEND26/entries',{teamName:'New',blendName:'Duplicate',recipe:f.recipe,age21:true,expectedTarget:f.first},owner);
  assert.equal(duplicate.status,409);
});

test('recipes reject wrong totals, unknown components, duplicate codes, fractional basis points and stale writes', async t => {
  const f=await blendingFixture(t,{teams:0}), owner=f.makeUser('Recipe Team'), recipeId=await f.enter(owner,'Recipe team','Original',false), path='/api/public/blending/BLEND26/entries/'+recipeId;
  const body={blendName:'Original',recipe:f.recipe,expectedRevision:0,submit:true,expectedTarget:f.first};
  for (const recipe of [f.recipe.map((r,i)=>({...r,bps:i?2500:2499})),f.recipe.map((r,i)=>({...r,code:i?r.code:'UNKNOWN'})),f.recipe.map(r=>({...r,code:'A'})),f.recipe.map((r,i)=>({...r,bps:i?2500:2500.5}))]) assert.equal((await f.request(path,{...body,recipe},owner)).status,400);
  assert.equal((await f.request(path,{...body,submit:false},owner)).status,200);
  assert.equal((await f.request(path,body,owner)).status,409);
  assert.equal((await f.request(path,{...body,expectedRevision:1},owner)).status,200);
  assert.equal((await f.request(path,{...body,expectedRevision:2},owner)).status,409);
  assert.equal(f.app.db.get('SELECT status FROM blend_recipes WHERE id=?',recipeId).status,'submitted');
});

test('deadline crossing requires explicit new destination confirmation and does not silently relocate a recipe', async t => {
  const f=await blendingFixture(t,{teams:0}), owner=f.makeUser('Late Draft'), recipeId=await f.enter(owner,'Late team','Draft',false);
  f.app.db.run('UPDATE blend_batches SET closes_at=? WHERE id=?',Date.now()-1,f.first);
  const body={blendName:'Draft',recipe:f.recipe,expectedRevision:0,submit:true,expectedTarget:f.first};
  assert.equal((await f.request('/api/public/blending/BLEND26/entries/'+recipeId,body,owner)).status,409);
  assert.equal(f.app.db.get('SELECT status FROM blend_recipes WHERE id=?',recipeId).status,'draft');
  assert.equal((await f.view(owner)).body.intake.batchId,f.second);
  assert.equal((await f.request('/api/public/blending/BLEND26/entries/'+recipeId,{...body,expectedTarget:f.second},owner)).status,200);
});

test('last batch capacity slot is atomic and overflow retains a path to the next batch', async t => {
  const f=await blendingFixture(t,{teams:1,capacity:2});
  const a=f.makeUser('Last Slot A'), b=f.makeUser('Last Slot B');
  const aid=await f.enter(a,'Team A','A draft',false), bid=await f.enter(b,'Team B','B draft',false);
  const results=await Promise.all([[a,aid],[b,bid]].map(([actor,id])=>f.request('/api/public/blending/BLEND26/entries/'+id,{blendName:actor.name,recipe:f.recipe,expectedRevision:0,submit:true,expectedTarget:f.first},actor)));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal(f.app.db.get("SELECT COUNT(*) n FROM blend_recipes WHERE batch_id=? AND status='submitted'",f.first).n,2);
  const loser=results[0].status===409?a:b;
  assert.equal((await f.view(loser)).body.intake.batchId,f.second);
});

test('next-competition queue is explicit, persists, and requires consent before later placement', async t => {
  const f=await blendingFixture(t,{teams:0}), owner=f.makeUser('Queue Team');
  f.app.db.run('UPDATE blend_batches SET closes_at=?',Date.now()-1);
  const target=(await f.view(owner)).body.intake; assert.equal(target.key,'next-competition');
  const input={teamName:'Queue Team',blendName:'Queued Blend',recipe:f.recipe,age21:true,expectedTarget:target.key};
  assert.equal((await f.request('/api/public/blending/BLEND26/entries',input,owner)).status,400);
  const made=await f.request('/api/public/blending/BLEND26/entries',{...input,acceptQueue:true},owner);assert.equal(made.status,201);
  const path='/api/public/blending/BLEND26/entries/'+made.body.recipeId;
  assert.equal((await f.request(path,{blendName:'Queued Blend',recipe:f.recipe,submit:true,expectedRevision:0,expectedTarget:target.key,acceptQueue:true},owner)).status,200);
  assert.equal((await f.view(owner)).body.myEntries[0].status,'queued');
  f.app.db.run('UPDATE blend_batches SET closes_at=? WHERE id=?',Date.now()+3600000,f.first);
  assert.equal((await f.request(path,{action:'place',expectedRevision:1,expectedTarget:'next-competition'},owner)).status,409);
  assert.equal((await f.request(path,{action:'place',expectedRevision:1,expectedTarget:f.first},owner)).status,200);
  assert.equal((await f.view(owner)).body.myEntries[0].status,'submitted');
});

test('judges see only blind samples and their own scorecards; private recipes and notes never leak publicly', async t => {
  const f=await blendingFixture(t,{teams:2}); const event=await f.prepare();
  const task=(await f.request('/api/blending/judging',undefined,f.judges[0])).body.tasks[0], entryId=task.entries[0].id;
  const body={batchId:f.first,entryId,aroma:20,palate:21,balance:22,finish:23,notes:'SECRET JUDGE NOTES',lock:true,expectedRevision:0};
  assert.equal((await f.request('/api/blending/judging/score',body,f.judges[0])).status,200);
  const other=(await f.request('/api/blending/judging',undefined,f.judges[1])).body;
  assert.ok(!contains(other,'SECRET JUDGE NOTES'));assert.ok(!contains(task,'Afterglow'));assert.ok(!contains(task,'The Oak Room'));
  const publicView=(await f.view()).body, existing=(await f.request('/api/public/games/'+event.code)).body;
  for (const payload of [publicView,existing]) for (const hidden of ['SECRET JUDGE NOTES','Afterglow','The Oak Room',f.judges[0].email,'components_snapshot']) assert.ok(!contains(payload,hidden),hidden);
  assert.equal(publicView.batches[0].results.length,0);
});

test('scorecard locking is server-enforced, including database triggers; judge and entry spoofing rejected', async t => {
  const f=await blendingFixture(t,{teams:2});await f.prepare();
  const task=(await f.request('/api/blending/judging',undefined,f.judges[0])).body.tasks[0], entry=task.entries[0];
  const body={batchId:f.first,entryId:entry.id,aroma:20,palate:21,balance:22,finish:23,lock:true,expectedRevision:0};
  assert.equal((await f.request('/api/blending/judging/score',body,f.teams[0])).status,403);
  assert.equal((await f.request('/api/blending/judging/score',{...body,entryId:'other-event-entry'},f.judges[0])).status,404);
  assert.equal((await f.request('/api/blending/judging/score',{...body,aroma:25.5},f.judges[0])).status,400);
  assert.equal((await f.request('/api/blending/judging/score',body,f.judges[0],{'X-CSRF-Token':''})).status,403);
  assert.equal((await f.request('/api/blending/judging/score',body,f.judges[0])).status,200);
  assert.equal((await f.request('/api/blending/judging/score',{...body,expectedRevision:1},f.judges[0])).status,409);
  assert.throws(()=>f.app.db.run('UPDATE blend_scorecards SET aroma=0 WHERE entry_id=?',entry.id),/Locked/);
  assert.throws(()=>f.app.db.run('DELETE FROM blend_scorecards WHERE entry_id=?',entry.id),/Locked/);
});

test('legacy phase, judge and arbitrary winner endpoints cannot bypass score-backed producer controls', async t => {
  const f=await blendingFixture(t,{teams:2}), event=await f.prepare();
  for (const path of ['/api/games/'+event.id+'/phase','/api/games/'+event.id+'/judge-submit','/api/admin/games/'+event.id+'/publish-outcome']) assert.equal((await f.request(path,{winnerEntryId:'injected',phase:'results',expectedRevision:0},f.producer)).status,409);
  assert.equal((await f.advance('open')).status,200);
  assert.equal((await f.request('/api/admin/blending/batches/'+f.first+'/advance',{action:'close',expectedRevision:0},f.producer)).status,409);
  assert.equal((await f.advance('reveal')).status,409);
  assert.equal((await f.advance('close')).status,200);
  assert.equal((await f.advance('reveal')).status,409);
  assert.equal(f.app.db.get('SELECT COUNT(*) n FROM tasting_outcomes').n,0);
});

test('late audience entry, per-round picks, reload identity and one authoritative score projection', async t => {
  const f=await blendingFixture(t), event=await f.prepare(); await f.scoreAll();
  assert.equal((await f.advance('open')).status,200);
  const joined=await f.request('/api/public/games/'+event.code+'/join',{name:'Opening viewer'});const viewer={Cookie:joined.cookie};
  let snapshot=(await f.request('/api/public/games/'+event.code,undefined,viewer)).body;
  const first=snapshot.event.matchups[0], winner=f.app.db.get('SELECT entry_id FROM blend_recipes WHERE id=?',f.teams[0].recipeId).entry_id;
  const pick=[first.entryAId,first.entryBId].includes(winner)?winner:first.entryAId;
  assert.equal((await f.request('/api/public/games/'+event.code+'/predict',{matchupId:first.id,entryId:pick},viewer)).status,200);
  assert.equal((await f.advance('close')).status,200);
  assert.equal((await f.request('/api/public/games/'+event.code+'/predict',{matchupId:first.id,entryId:first.entryBId},viewer)).status,409);
  assert.equal((await f.advance('reveal')).status,200);
  const late=await f.request('/api/public/games/'+event.code+'/join',{name:'Joined during reveal'});const lateViewer={Cookie:late.cookie};
  assert.equal(late.status,200);assert.equal((await f.advance('open')).status,200);
  snapshot=(await f.request('/api/public/games/'+event.code,undefined,lateViewer)).body;
  const second=snapshot.event.matchups.find(m=>m.id===snapshot.event.activeMatchupId);
  assert.equal((await f.request('/api/public/games/'+event.code+'/predict',{matchupId:first.id,entryId:first.entryAId},lateViewer)).status,409);
  assert.equal((await f.request('/api/public/games/'+event.code+'/predict',{matchupId:second.id,entryId:second.entryAId},lateViewer)).status,200);
  const reloaded=(await f.request('/api/public/games/'+event.code,undefined,lateViewer)).body;
  assert.equal(reloaded.participant.id,snapshot.participant.id);assert.equal(reloaded.predictions.length,1);
  assert.equal((await f.advance('close')).status,200);assert.equal((await f.advance('reveal')).status,200);
  const publicState=(await f.view()).body;
  assert.deepEqual(publicState.audience.eventStandings,scoreRows(f.app.db,event.id));
  assert.deepEqual(publicState.audience.roundStandings,scoreRows(f.app.db,event.id,second.id));
});

test('only published locked judge choices contribute points; result publication rolls back atomically', async t => {
  const f=await blendingFixture(t,{teams:2}), event=await f.prepare();await f.scoreAll();
  assert.equal(f.app.db.get('SELECT COUNT(*) n FROM tasting_judge_submissions').n,0);
  assert.equal((await f.advance('open')).status,200);assert.equal((await f.advance('close')).status,200);
  const originalRun=f.app.db.run;
  f.app.db.run=(sql,...args)=>{if(sql.startsWith('UPDATE tasting_events SET phase='))throw Error('Injected transaction failure');return originalRun(sql,...args);};
  assert.equal((await f.advance('reveal')).status,500);
  f.app.db.run=originalRun;
  assert.equal(f.app.db.get('SELECT COUNT(*) n FROM tasting_outcomes').n,0);
  assert.equal(f.app.db.get('SELECT COUNT(*) n FROM tasting_judge_submissions').n,0);
  assert.equal(f.app.db.get('SELECT phase FROM tasting_events WHERE id=?',event.id).phase,'judging');
  assert.equal((await f.advance('reveal')).status,200);
  assert.equal(f.app.db.get('SELECT COUNT(*) n FROM tasting_judge_submissions').n,3);
  assert.ok(!contains((await f.view()).body,'Private synthetic tasting notes'));
});

test('exact score ties block publication rather than choosing an arbitrary winner', async t => {
  const f=await blendingFixture(t,{teams:2});await f.prepare();await f.scoreAll(f.first,true);
  await f.advance('open');await f.advance('close');
  const result=await f.advance('reveal');assert.equal(result.status,409);assert.match(result.body.error,/tie/i);
  assert.equal(f.app.db.get('SELECT COUNT(*) n FROM tasting_outcomes').n,0);
});

test('completed flight awards only its reserved places, keeps identity and recipe private, and sends qualifiers to a fresh final', async t => {
  const f=await blendingFixture(t);await f.prepare();await f.scoreAll();
  const complete=await f.complete();assert.equal(complete.status,200);assert.equal(complete.body.qualification.awarded,1);
  assert.equal(f.app.db.get('SELECT COUNT(*) n FROM blend_qualifications').n,1);
  const winner=(await f.view(f.teams[0])).body;assert.equal(winner.team.qualified,true);assert.equal(winner.intake.batchId,f.final);
  const losing=(await f.view(f.teams[1])).body;assert.equal(losing.team.qualified,false);assert.equal(losing.intake.batchId,f.second);
  const rows=(await f.view()).body.batches.find(b=>b.id===f.first).results;
  assert.equal(rows.length,6);assert.equal(rows[0].teamName,'The Oak Room');assert.equal(rows[0].average,96);assert.equal(rows[0].qualified,true);
  assert.ok(!contains(rows,'recipe'));assert.ok(!contains(rows,'owner_user_id'));
  assert.equal((await f.advance('complete')).status,409);
  const newRecipe=await f.enter(f.teams[0],'The Oak Room','A fresh championship blend');
  assert.equal(f.app.db.get('SELECT batch_id FROM blend_recipes WHERE id=?',newRecipe).batch_id,f.final);
});

test('new entrants cannot enter an already-locked championship even if an old accepting batch still exists', async t => {
  const f=await blendingFixture(t,{teams:0}), actor=f.makeUser('After Final Lock');
  f.app.db.run("UPDATE blend_batches SET status='prepared' WHERE id=?",f.final);
  const state=(await f.view(actor)).body;assert.equal(state.intake.key,'next-competition');
  const recipeId=await f.enter(actor);assert.equal(f.app.db.get('SELECT status FROM blend_recipes WHERE id=?',recipeId).status,'queued');
});

test('components, allotted places, accepted deadlines and judge conflicts have server-side protections', async t => {
  const f=await blendingFixture(t,{teams:2}), host=(await f.host()).body;
  const season=host.season;
  assert.equal((await f.request('/api/admin/blending/seasons/BLEND26/configure',{...season,components:season.components.map((r,i)=>({...r,name:i?r.name:'Different whiskey'})),expectedRevision:season.revision},f.producer)).status,409);
  const first=host.batches.find(b=>b.id===f.first);
  const config={name:first.name,stage:first.stage,slots:first.slots,capacity:first.capacity,closesAt:first.closes_at-1000,judges:first.judges,expectedRevision:first.revision};
  assert.equal((await f.request('/api/admin/blending/batches/'+f.first+'/configure',config,f.producer)).status,409);
  assert.equal((await f.request('/api/admin/blending/seasons/BLEND26/batches',{...config,closesAt:Date.now()+3600000},f.producer)).status,409);
  const roster=JSON.parse(f.app.db.get('SELECT judges FROM blend_batches WHERE id=?',f.first).judges);roster[0].userId=f.teams[0].id;
  f.app.db.run('UPDATE blend_batches SET judges=?,closes_at=? WHERE id=?',JSON.stringify(roster),Date.now()-1,f.first);
  assert.equal((await f.request('/api/admin/blending/batches/'+f.first+'/prepare',{expectedRevision:first.revision},f.producer)).status,409);
  assert.equal(f.app.db.get('SELECT COUNT(*) n FROM tasting_events').n,0);
});
