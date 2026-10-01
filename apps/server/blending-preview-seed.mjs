/** Disposable, fictional data only. This function receives an in-memory preview DB. */
import {randomBytes, randomUUID} from 'node:crypto';
import {hash} from './security.mjs';

export function seedBlendingPreview(db) {
  const id = () => randomUUID(), stamp = Date.now(), day = 86400000;
  const csrf = randomBytes(32).toString('hex');
  function user(name, role = 'venue', number = 0) {
    const userId = id(), secret = randomBytes(32).toString('hex');
    // No usable password. The outer preview router supplies these principals only
    // to the in-memory blending routes, never to the normal application API.
    db.run('INSERT INTO users(id,email,password_hash,name,platform_role,created_at) VALUES(?,?,?,?,?,?)',
      userId, `preview-${number}@example.test`, 'no-password-preview-principal', name, role, stamp);
    db.run('INSERT INTO game_profiles VALUES(?,?,?)', userId, name, stamp);
    db.run('INSERT INTO sessions VALUES(?,?,?,?)', hash(secret), userId, csrf, stamp + 365 * day);
    return {id: userId, name, cookie: 'mixx_session=' + secret};
  }
  const producer = user('Preview Captain', 'admin', 1);
  const judges = [2,3,4].map((n, i) => ({...user('Demo Judge ' + (i + 1), 'venue', n), key: String(i + 1)}));
  const components = [{code:'A',name:'Demo bourbon · vanilla and oak · batch A'},
    {code:'B',name:'Demo high-rye bourbon · batch B'}, {code:'C',name:'Demo double-oaked bourbon · batch C'},
    {code:'D',name:'Demo mature bourbon · batch D'}];
  const rules = [{key:'round1',label:'Round 1 · late 2026',slots:2},
    {key:'round2',label:'Round 2 · first half of 2027',slots:2},
    {key:'last-chance',label:'Last-chance qualification',slots:2},
    {key:'final',label:'Championship · Q4 2027',slots:0}];
  const seasonId = id(), code = 'TRYBG', eventId = id(), eventCode = 'BGDEMO';
  db.run('INSERT INTO blend_seasons(id,code,name,components,stage_rules,is_test,created_at) VALUES(?,?,?,?,?,1,?)',
    seasonId, code, 'Season One · Open build preview', JSON.stringify(components), JSON.stringify(rules), stamp);
  const roster = JSON.stringify(judges.map(j => ({name:j.name,userId:j.id})));
  function batch(name, stage, days, slots, event = null) {
    const batchId = id();
    db.run('INSERT INTO blend_batches(id,season_id,name,stage,closes_at,slots,capacity,judges,status,event_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      batchId, seasonId, name, stage, stamp + days * day, slots, 48, roster, event ? 'prepared' : 'accepting', event, stamp);
    return batchId;
  }
  db.run('INSERT INTO tasting_events(id,code,name,status,created_at,updated_at) VALUES(?,?,?,?,?,?)',
    eventId, eventCode, 'Open preview · Demo flight', 'open', stamp, stamp);
  const first = batch('Round 1 · Demo opening flight', 'round1', -1, 1, eventId);
  batch('Round 1 · Next judging flight', 'round1', 14, 1);
  batch('Round 2 · Spring qualifier', 'round2', 180, 2);
  batch('Last-chance qualifier', 'last-chance', 330, 2);
  batch('Season One Championship', 'final', 390, 0);
  const names = ['The Oak Room','River Rats','After Hours','Copper & Co.','Warehouse Club','Sunday Tasters'];
  const blends = ['Afterglow','River No. 4','Last Light','Copper Cut','Warehouse 09','Sunday Reserve'];
  const recipe = JSON.stringify(components.map(c => ({code:c.code,bps:2500})));
  const entryIds = names.map((name, i) => {
    const owner = user('Demo Captain ' + (i + 1), 'venue', i + 5), teamId = id(), entryId = id();
    db.run('INSERT INTO blend_teams VALUES(?,?,?,?,?)',teamId,seasonId,owner.id,name,stamp);
    db.run('INSERT INTO tasting_entries(id,event_id,seed,name,story) VALUES(?,?,?,?,?)',
      entryId,eventId,i+1,'Sample ' + (101+i),'Fictional sample for the open build preview.');
    db.run("INSERT INTO blend_recipes(id,season_id,team_id,batch_id,blend_name,recipe,components_snapshot,status,entry_id,created_at,submitted_at) VALUES(?,?,?,?,?,?,?,'submitted',?,?,?)",
      id(),seasonId,teamId,first,blends[i],recipe,JSON.stringify(components),entryId,stamp,stamp);
    return entryId;
  });
  for (let i=0;i<entryIds.length;i+=2) db.run('INSERT INTO tasting_matchups(id,event_id,round,slot,entry_a_id,entry_b_id) VALUES(?,?,?,?,?,?)',
    id(),eventId,1,i/2+1,entryIds[i],entryIds[i+1]);
  for (const judge of judges) {
    const judgeId = id();
    db.run('INSERT INTO tasting_judges VALUES(?,?,?)',judgeId,eventId,judge.name);
    db.run('INSERT INTO tasting_judge_users VALUES(?,?,?)',judgeId,judge.id,stamp);
    entryIds.forEach((entryId,i) => db.run('INSERT INTO blend_scorecards(entry_id,judge_id,aroma,palate,balance,finish,notes) VALUES(?,?,?,?,?,?,?)',
      entryId,judgeId,24-i,24-i,24-i,24-i,'Example score only. Edit it to try judging.'));
  }
  db.run('INSERT INTO tasting_event_operators VALUES(?,?,?)',eventId,producer.id,stamp);
  return {producer,judges,csrf,code,eventCode,first};
}
