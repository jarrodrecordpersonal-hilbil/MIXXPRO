/** Synthetic-only HTTP fixture. Never accepts a live URL or inherits provider credentials. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createApplication, configuration} from '../../apps/server/app.mjs';
import {hash, passwordHash} from '../../apps/server/security.mjs';

export const PASSWORD = 'Blending-Pilot-Only-2026!';
const pw = await passwordHash(PASSWORD);
export async function blendingFixture(t = null, options = {}) {
  const app = createApplication({config:configuration({NODE_ENV:'test', DB_PATH:options.dbPath || ':memory:', DEMO_MODE:'true', SIGNUPS_ENABLED:'true', APP_ORIGIN:'http://127.0.0.1', APP_SECRET:'synthetic-blending-pilot-secret-not-production'})});
  await new Promise(resolve => app.server.listen(options.port || 0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  app.config.APP_ORIGIN = base;
  if (t) t.after(() => app.close());
  async function request(path, body, actor = null, extras = {}) {
    const response = await fetch(base + path, {method:body === undefined ? 'GET' : 'POST', headers:{'Content-Type':'application/json', Origin:base, ...(actor?.headers || actor || {}), ...extras}, body:body === undefined ? undefined : JSON.stringify(body)});
    const type = response.headers.get('content-type') || '';
    return {status:response.status, body:type.includes('application/json') ? await response.json() : await response.text(), cookie:response.headers.get('set-cookie')?.split(';')[0], headers:response.headers};
  }
  let number = 0;
  function makeUser(name, role = 'venue') {
    const id = randomUUID(), secret = randomUUID(), csrf = randomUUID(), email = 'pilot-' + (++number) + '@example.test';
    app.db.run('INSERT INTO users(id,email,password_hash,name,platform_role,created_at) VALUES(?,?,?,?,?,?)', id, email, pw, name, role, Date.now());
    app.db.run('INSERT INTO game_profiles VALUES(?,?,?)', id, name, Date.now());
    app.db.run('INSERT INTO sessions VALUES(?,?,?,?)', hash(secret), id, csrf, Date.now() + 86400000);
    return {id, name, email, password:PASSWORD, headers:{Cookie:'mixx_session=' + secret, 'X-CSRF-Token':csrf}};
  }
  const producer = makeUser('Pilot Producer', 'admin');
  const judges = ['Pilot Judge One','Pilot Judge Two','Pilot Judge Three'].map(name => makeUser(name));
  const components = [{code:'A',name:'Test bourbon · vanilla & oak · batch A'},{code:'B',name:'Test high-rye bourbon · batch B'},{code:'C',name:'Test double-oaked bourbon · batch C'},{code:'D',name:'Test mature bourbon · batch D'}];
  const recipe = components.map(c => ({code:c.code,bps:2500}));
  const created = await request('/api/admin/blending/seasons', {name:'Season One · 2026–2027',code:'BLEND26',components}, producer);
  assert.equal(created.status,201,JSON.stringify(created.body));
  const roster = judges.map(j => ({name:j.name,email:j.email}));
  async function addBatch(name, stage, closesAt, slots, capacity = 48) {
    const result = await request('/api/admin/blending/seasons/BLEND26/batches', {name,stage,closesAt,slots,capacity,judges:roster}, producer);
    assert.equal(result.status,201,JSON.stringify(result.body)); return result.body.batchId;
  }
  const first = await addBatch('Round 1 · Opening flight', 'round1', Date.now() + 3600000, 1, options.capacity || 48);
  const second = await addBatch('Round 1 · Next judging flight', 'round1', Date.now() + 14 * 86400000, 1);
  const round2 = await addBatch('Round 2 · Spring qualifier', 'round2', Date.now()+180*86400000, 2);
  const last = await addBatch('Last-chance qualifier', 'last-chance', Date.now()+330*86400000, 2);
  const final = await addBatch('Season One Championship', 'final', Date.now()+390*86400000, 0);
  const view = actor => request('/api/public/blending/BLEND26', undefined, actor);
  const host = () => request('/api/admin/blending/seasons/BLEND26', undefined, producer);
  async function enter(actor, teamName = actor.name, blendName = actor.name + ' blend', submit = true) {
    const target = (await view(actor)).body.intake;
    const made = await request('/api/public/blending/BLEND26/entries', {teamName,blendName,age21:true,recipe,expectedTarget:target.key,acceptQueue:!target.batchId}, actor);
    assert.equal(made.status,201,JSON.stringify(made.body));
    if (submit) {
      const result = await request('/api/public/blending/BLEND26/entries/' + made.body.recipeId, {blendName,recipe,expectedRevision:0,submit:true,expectedTarget:target.key,acceptQueue:!target.batchId}, actor);
      assert.equal(result.status,200,JSON.stringify(result.body));
    }
    return made.body.recipeId;
  }
  const names = ['The Oak Room','River Rats','After Hours','Copper & Co.','Warehouse Club','Sunday Tasters'];
  const blends = ['Afterglow','River No. 4','Last Light','Copper Cut','Warehouse 09','Sunday Reserve'];
  const teams = [];
  for (let i = 0; i < (options.teams ?? 6); i++) {
    const actor = makeUser(names[i] || 'Test Team ' + i);
    actor.recipeId = await enter(actor, names[i] || actor.name, blends[i] || actor.name + ' blend'); teams.push(actor);
  }
  async function prepare(batchId = first) {
    // Simulates the clock crossing the deadline in this disposable test database only.
    app.db.run('UPDATE blend_batches SET closes_at=? WHERE id=?', Date.now() - 1000, batchId);
    const batch = app.db.get('SELECT * FROM blend_batches WHERE id=?', batchId);
    const result = await request('/api/admin/blending/batches/' + batchId + '/prepare', {expectedRevision:batch.revision}, producer);
    assert.equal(result.status,201,JSON.stringify(result.body));
    return app.db.get('SELECT * FROM tasting_events WHERE code=?', result.body.eventCode);
  }
  async function scoreAll(batchId = first, uniform = false, skipFirst = false) {
    for (let j = 0; j < judges.length; j++) {
      const tasks = (await request('/api/blending/judging', undefined, judges[j])).body.tasks;
      const task = tasks.find(t => t.batchId === batchId);
      for (const entry of task.entries) {
        if (skipFirst && j === 0 && entry.id === task.entries[0].id) continue;
        const recipeRow = app.db.get('SELECT team_id FROM blend_recipes WHERE entry_id=?', entry.id);
        const owner = app.db.get('SELECT owner_user_id FROM blend_teams WHERE id=?', recipeRow.team_id).owner_user_id;
        const i = Math.max(0, teams.findIndex(t => t.id === owner));
        const score = uniform ? 20 : 24 - i;
        const result = await request('/api/blending/judging/score', {batchId,entryId:entry.id,aroma:score,palate:score,balance:score,finish:score,notes:'Private synthetic tasting notes',lock:true,expectedRevision:0}, judges[j]);
        assert.equal(result.status,200,JSON.stringify(result.body));
      }
    }
  }
  async function advance(action, batchId = first) {
    const batch = app.db.get('SELECT * FROM blend_batches WHERE id=?', batchId);
    const event = app.db.get('SELECT * FROM tasting_events WHERE id=?', batch.event_id);
    return request('/api/admin/blending/batches/' + batchId + '/advance', {action,expectedRevision:event.state_revision,seconds:120}, producer);
  }
  async function complete(batchId = first) {
    for (;;) {
      const current = (await host()).body.batches.find(b => b.id === batchId).event;
      if (current.outcomes.length === current.matchups.length) break;
      if (['lobby','results'].includes(current.phase)) assert.equal((await advance('open',batchId)).status,200);
      if ((await host()).body.batches.find(b => b.id === batchId).event.phase === 'predictions') assert.equal((await advance('close',batchId)).status,200);
      const result = await advance('reveal',batchId); assert.equal(result.status,200,JSON.stringify(result.body));
    }
    return advance('complete',batchId);
  }
  return {app,base,request,producer,judges,teams,components,recipe,first,second,round2,last,final,view,host,enter,prepare,scoreAll,advance,complete,makeUser,addBatch};
}
