import {readFileSync} from 'node:fs';
import {randomInt} from 'node:crypto';
import {accountWrite, gameAccountView} from '../game-identity.mjs';
import {eventView} from './games.mjs';
import {STAGES, CRITERIA, SCORING, decoded, enabled, seasonFor, batchFor, revision,
  validComponents, validRecipe, validJudges, teamFor, intakeTarget, assertTarget,
  scoredEntries, compareVectors, publicSeason, advanceQualifications} from '../blending.mjs';

const PAGE_CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'; object-src 'none'";

function admin(c) { const user = c.admin(c.req); accountWrite(c); return user; }
function audit(c, user, action, detail) { c.audit(user.id, null, 'blending.' + action, detail); }
function stageRules(c, input) {
  const rules = input || Object.entries(STAGES).map(([key, label]) => ({key, label, slots: key === 'final' ? 0 : 2}));
  if (!Array.isArray(rules) || rules.length !== 4 || new Set(rules.map(r => r?.key)).size !== 4 || rules.some(r => !STAGES[r?.key])) c.fail(400, 'Include the four season milestones.');
  return rules.map(r => ({key: r.key, label: c.text(r.label, 'Milestone name', 80), slots: c.integer(r.slots, 'Milestone places', 0, 20)}));
}
function batchInput(c, season, prior = null) {
  const stage = c.choice(c.b.stage, Object.keys(STAGES), 'season stage');
  const slots = stage === 'final' ? 0 : c.integer(c.b.slots, 'Championship places', 0, 20);
  const closesAt = c.integer(c.b.closesAt, 'Submission deadline', 1, 8640000000000000);
  const reserved = c.db.get('SELECT COALESCE(SUM(slots),0) n FROM blend_batches WHERE season_id=? AND stage=? AND id!=?', season.id, stage, prior?.id || '').n;
  if (stage !== 'final' && reserved + slots > decoded(season.stage_rules).find(r => r.key === stage).slots) c.fail(409, 'This would exceed the championship places reserved for that milestone.');
  const judges = validJudges(c, c.b.judges);
  return {name: c.text(c.b.name, 'Judging batch name', 80), stage, slots, closesAt,
    capacity: c.integer(c.b.capacity ?? 48, 'Batch capacity', 2, 100), judges};
}
function myRecipe(c, recipeId, user) {
  const row = c.db.get('SELECT r.*,t.owner_user_id FROM blend_recipes r JOIN blend_teams t ON t.id=r.team_id WHERE r.id=? AND t.owner_user_id=?', recipeId, user.id);
  if (!row) c.fail(404, 'Your blend entry was not found.');
  return row;
}
function hostView(c, season) {
  const batches = c.db.all('SELECT * FROM blend_batches WHERE season_id=? ORDER BY closes_at,created_at,id', season.id).map(batch => {
    const entries = c.db.all('SELECT r.id,r.blend_name AS blendName,r.recipe,r.status,r.revision,t.name AS teamName,e.name AS sample FROM blend_recipes r JOIN blend_teams t ON t.id=r.team_id LEFT JOIN tasting_entries e ON e.id=r.entry_id WHERE r.batch_id=? ORDER BY r.created_at', batch.id);
    const scores = batch.event_id ? scoredEntries(c, batch) : [];
    return {...batch, judges: decoded(batch.judges).map(j => ({name: j.name, email: c.db.get('SELECT email FROM users WHERE id=?', j.userId)?.email || ''})),
      entries: entries.map(r => ({...r, recipe: decoded(r.recipe)})),
      lockedCards: scores.reduce((sum, row) => sum + row.cards.length, 0),
      expectedCards: scores.length * decoded(batch.judges).length,
      allScoresLocked: scores.length > 0 && scores.every(row => row.ready),
      event: batch.event_id ? eventView(c.db, c.db.get('SELECT * FROM tasting_events WHERE id=?', batch.event_id)) : null};
  });
  return {season: {code: season.code, name: season.name, revision: season.revision, components: decoded(season.components), stages: decoded(season.stage_rules), isTest: !!season.is_test}, batches,
    queued: c.db.all("SELECT r.id,r.blend_name AS blendName,t.name AS teamName,r.submitted_at AS submittedAt FROM blend_recipes r JOIN blend_teams t ON t.id=r.team_id WHERE r.season_id=? AND r.status='queued' ORDER BY r.submitted_at", season.id), scoring: SCORING};
}

export async function blendingRoutes(c) {
  const {req, res, path, method, b, db, json, now, id, transaction, fail, text} = c;
  // Never allow generic winner-entry/phase endpoints to override score-backed blend events.
  const legacy = /^\/api\/(?:admin\/)?games\/([^/]+)\/(phase|judge-submit|publish-outcome)$/.exec(path);
  if (method === 'POST' && legacy && db.get('SELECT 1 FROM blend_batches WHERE event_id=?', legacy[1]))
    fail(409, 'Use the Blending Games producer controls and locked blind scorecards for this event.');
  const qr = /^\/blending-qr\/([A-Za-z0-9_-]+)\.svg$/.exec(path);
  if (method === 'GET' && qr && enabled(c)) {
    seasonFor(c, qr[1]);
    res.setHeader('Content-Security-Policy', PAGE_CSP);
    res.writeHead(200, {'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store'});
    return res.end(c.qrSvg(c.config.APP_ORIGIN + '/blending/' + qr[1]));
  }
  const assets = {'/blending.css': ['blending.css', 'text/css'], '/blending.mjs': ['blending.mjs', 'text/javascript']};
  const page = path === '/blending' || path === '/blending/' || /^\/blending\/[A-Za-z0-9_-]+$/.test(path);
  if ((page || assets[path]) && ['GET', 'HEAD'].includes(method)) {
    res.setHeader('Content-Security-Policy', PAGE_CSP);
    const [file, mime] = assets[path] || ['blending.html', 'text/html'];
    res.writeHead(200, {'Content-Type': mime + '; charset=utf-8', 'Cache-Control': 'no-cache'});
    return res.end(method === 'HEAD' ? '' : readFileSync(new URL('../../web/public/' + file, import.meta.url)));
  }
  const relevant = path.startsWith('/api/public/blending') || path.startsWith('/api/admin/blending') || path.startsWith('/api/blending/judging');
  if (!relevant) return;
  if (!enabled(c)) fail(404, 'The Blending Games pilot is not enabled.');
  if (method === 'GET' && path === '/api/public/blending') {
    const seasons = db.all('SELECT code,name,is_test AS isTest FROM blend_seasons ORDER BY created_at DESC,id');
    const user = c.readSession(req);
    return json(res, 200, {seasons, account: gameAccountView(c, ''), canManage: user?.platform_role === 'admin', accountsEnabled: c.config.GAME_ACCOUNTS_ENABLED});
  }
  const publicRoute = /^\/api\/public\/blending\/([A-Za-z0-9_-]+)(?:\/(entries|entries\/[^/]+))?$/.exec(path);
  if (publicRoute) {
    const season = seasonFor(c, publicRoute[1]);
    if (method === 'GET' && !publicRoute[2]) return json(res, 200, publicSeason(c, season));
    if (method !== 'POST' || !publicRoute[2]) return;
    if (!c.config.GAME_ACCOUNTS_ENABLED) fail(403, 'Enable player accounts before accepting team entries.');
    const user = accountWrite(c);
    c.rateLimit(db, 'blend-write:' + user.id, 60, 60000);
    if (!db.get('SELECT 1 FROM game_profiles WHERE user_id=?', user.id)) fail(409, 'Create your public player profile first.');
    if (publicRoute[2] === 'entries') {
      if (b.age21 !== true) fail(400, 'Confirm that the competing team members are 21 or older.');
      const teamName = text(b.teamName, 'Team name', 60), blendName = text(b.blendName, 'Blend name', 70);
      const components = decoded(season.components), recipe = validRecipe(c, components, b.recipe, false);
      let recipeId;
      transaction(() => {
        let team = teamFor(c, season.id, user);
        if (team && db.get("SELECT 1 FROM blend_recipes WHERE team_id=? AND status IN ('draft','queued')", team.id)) fail(409, 'Open your existing draft or queued blend instead of creating a duplicate.');
        const target = intakeTarget(c, season, team); assertTarget(c, target);
        if (!team) {
          team = {id: id()};
          db.run('INSERT INTO blend_teams VALUES(?,?,?,?,?)', team.id, season.id, user.id, teamName, now());
        }
        recipeId = id();
        db.run('INSERT INTO blend_recipes(id,season_id,team_id,batch_id,blend_name,recipe,components_snapshot,created_at) VALUES(?,?,?,?,?,?,?,?)', recipeId, season.id, team.id, target.batchId, blendName, JSON.stringify(recipe), season.components, now());
        audit(c, user, 'draft.created', {recipeId, batchId: target.batchId});
      });
      return json(res, 201, {ok: true, recipeId});
    }
    const recipeId = publicRoute[2].split('/')[1];
    const row = myRecipe(c, recipeId, user);
    if (row.season_id !== season.id) fail(404, 'Entry not found in this season.');
    if (row.status === 'queued' && b.action === 'place') {
      let target;
      transaction(() => {
        const fresh = myRecipe(c, recipeId, user); revision(c, fresh.revision);
        if (fresh.status !== 'queued') fail(409, 'This queue entry has already been placed.');
        target = intakeTarget(c, season); assertTarget(c, target);
        if (!target.batchId) fail(409, 'No new judging intake has been published yet.');
        db.run("UPDATE blend_recipes SET batch_id=?,status='submitted',submitted_at=?,revision=revision+1 WHERE id=?", target.batchId, now(), recipeId);
        audit(c, user, 'queue.placed', {recipeId, batchId: target.batchId});
      });
      return json(res, 200, {ok: true, destination: target});
    }
    if (row.status !== 'draft') fail(409, 'This blend is submitted and locked.');
    const submit = b.submit === true;
    const recipe = validRecipe(c, decoded(row.components_snapshot), b.recipe, submit);
    const blendName = text(b.blendName, 'Blend name', 70);
    let destination;
    transaction(() => {
      const fresh = myRecipe(c, recipeId, user); revision(c, fresh.revision);
      if (fresh.status !== 'draft') fail(409, 'This blend is submitted and locked.');
      destination = intakeTarget(c, season);
      if (submit) assertTarget(c, destination);
      // Drafts do not reserve a place. Reassignment only occurs with an explicitly confirmed submission.
      const batchId = submit ? destination.batchId : fresh.batch_id;
      if (batchId && db.get("SELECT 1 FROM blend_recipes WHERE team_id=? AND batch_id=? AND id!=? AND status!='draft'", fresh.team_id, batchId, recipeId)) fail(409, 'Your team has already entered this judging batch.');
      const status = submit ? (batchId ? 'submitted' : 'queued') : 'draft';
      db.run('UPDATE blend_recipes SET batch_id=?,blend_name=?,recipe=?,status=?,submitted_at=?,revision=revision+1 WHERE id=?', batchId, blendName, JSON.stringify(recipe), status, submit ? now() : null, recipeId);
      audit(c, user, submit ? 'recipe.submitted' : 'draft.saved', {recipeId, batchId, revision: fresh.revision + 1});
    });
    return json(res, 200, {ok: true, destination: submit ? destination : null});
  }
  if (method === 'GET' && path === '/api/blending/judging') {
    const user = c.requireSession(req);
    const tasks = db.all("SELECT * FROM blend_batches WHERE status IN ('prepared','complete') ORDER BY created_at DESC").flatMap(batch => {
      const assigned = db.get('SELECT j.id,j.name FROM tasting_judges j JOIN tasting_judge_users ju ON ju.judge_id=j.id WHERE j.event_id=? AND ju.user_id=?', batch.event_id, user.id);
      if (!assigned) return [];
      const season = db.get('SELECT name,is_test FROM blend_seasons WHERE id=?', batch.season_id);
      return [{batchId: batch.id, batchName: batch.name, seasonName: season.name, isTest: !!season.is_test, status: batch.status,
        judgeId: assigned.id, judgeName: assigned.name, entries: db.all('SELECT id,name AS sample FROM tasting_entries WHERE event_id=? ORDER BY seed', batch.event_id),
        cards: db.all('SELECT s.entry_id AS entryId,s.aroma,s.palate,s.balance,s.finish,s.notes,s.locked_at AS lockedAt,s.revision FROM blend_scorecards s JOIN tasting_entries e ON e.id=s.entry_id WHERE s.judge_id=? AND e.event_id=?', assigned.id, batch.event_id)}];
    });
    return json(res, 200, {tasks, csrf: user.csrf, scoring: SCORING});
  }
  if (method === 'POST' && path === '/api/blending/judging/score') {
    const user = accountWrite(c), batch = batchFor(c, text(b.batchId, 'Batch', 80));
    if (batch.status !== 'prepared') fail(409, 'Scoring is closed for this batch.');
    const assigned = db.get('SELECT j.id FROM tasting_judges j JOIN tasting_judge_users ju ON ju.judge_id=j.id WHERE j.event_id=? AND ju.user_id=?', batch.event_id, user.id);
    if (!assigned) fail(403, 'Assigned judge access required.');
    const entryId = text(b.entryId, 'Blind entry', 80);
    if (!db.get('SELECT 1 FROM tasting_entries WHERE id=? AND event_id=?', entryId, batch.event_id)) fail(404, 'Blind entry not found.');
    const scores = CRITERIA.map(key => c.integer(b[key], key, 0, 25));
    const notes = text(b.notes || '', 'Private tasting notes', 1000, true);
    transaction(() => {
      const prior = db.get('SELECT * FROM blend_scorecards WHERE entry_id=? AND judge_id=?', entryId, assigned.id);
      revision(c, prior?.revision || 0);
      if (prior?.locked_at != null) fail(409, 'Your scorecard is locked.');
      if (db.get('SELECT 1 FROM tasting_outcomes o JOIN tasting_matchups m ON m.id=o.matchup_id WHERE m.event_id=?', batch.event_id)) fail(409, 'Scoring is closed after the first reveal.');
      db.run('INSERT INTO blend_scorecards(entry_id,judge_id,aroma,palate,balance,finish,notes,locked_at,revision) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(entry_id,judge_id) DO UPDATE SET aroma=excluded.aroma,palate=excluded.palate,balance=excluded.balance,finish=excluded.finish,notes=excluded.notes,locked_at=excluded.locked_at,revision=excluded.revision', entryId, assigned.id, ...scores, notes, b.lock === true ? now() : null, (prior?.revision || 0) + 1);
      audit(c, user, b.lock === true ? 'score.locked' : 'score.saved', {batchId: batch.id, entryId, judgeId: assigned.id});
    });
    return json(res, 200, {ok: true});
  }
  if (method === 'POST' && path === '/api/admin/blending/seasons') {
    const user = admin(c), code = text(b.code, 'Season code', 20).toUpperCase();
    if (!/^[A-Z0-9_-]{3,20}$/.test(code)) fail(400, 'Use 3–20 letters, numbers, underscores or dashes for the season code.');
    const components = validComponents(c, b.components), rules = stageRules(c, b.stages);
    if (db.get('SELECT 1 FROM blend_seasons WHERE code=?', code)) fail(409, 'This season code already exists.');
    const seasonId = id();
    db.run('INSERT INTO blend_seasons(id,code,name,components,stage_rules,is_test,created_at) VALUES(?,?,?,?,?,?,?)', seasonId, code, text(b.name, 'Season name', 90), JSON.stringify(components), JSON.stringify(rules), c.config.DEMO_MODE ? 1 : 0, now());
    audit(c, user, 'season.created', {seasonId});
    return json(res, 201, {ok: true, code});
  }
  const seasonAdmin = /^\/api\/admin\/blending\/seasons\/([A-Za-z0-9_-]+)(?:\/(configure|batches))?$/.exec(path);
  if (seasonAdmin) {
    c.admin(req);
    const season = seasonFor(c, seasonAdmin[1]);
    if (method === 'GET' && !seasonAdmin[2]) return json(res, 200, hostView(c, season));
    if (method !== 'POST') return;
    const user = admin(c);
    if (seasonAdmin[2] === 'configure') {
      const components = validComponents(c, b.components), rules = stageRules(c, b.stages);
      transaction(() => {
        revision(c, seasonFor(c, season.code).revision);
        if (JSON.stringify(components) !== season.components && db.get('SELECT 1 FROM blend_recipes WHERE season_id=?', season.id)) fail(409, 'Components are frozen once an entry exists. Create a new season for a different component set.');
        for (const rule of rules) if (db.get('SELECT COALESCE(SUM(slots),0) n FROM blend_batches WHERE season_id=? AND stage=?', season.id, rule.key).n > rule.slots) fail(409, 'Keep enough milestone places for existing judging batches.');
        db.run('UPDATE blend_seasons SET name=?,components=?,stage_rules=?,revision=revision+1 WHERE id=?', text(b.name, 'Season name', 90), JSON.stringify(components), JSON.stringify(rules), season.id);
        audit(c, user, 'season.configured', {seasonId: season.id});
      });
      return json(res, 200, {ok: true});
    }
    if (seasonAdmin[2] === 'batches') {
      let batchId;
      transaction(() => {
        const input = batchInput(c, season); batchId = id();
        db.run('INSERT INTO blend_batches(id,season_id,name,stage,closes_at,slots,capacity,judges,created_at) VALUES(?,?,?,?,?,?,?,?,?)', batchId, season.id, input.name, input.stage, input.closesAt, input.slots, input.capacity, JSON.stringify(input.judges), now());
        audit(c, user, 'batch.created', {batchId});
      });
      return json(res, 201, {ok: true, batchId});
    }
  }
  const batchAdmin = /^\/api\/admin\/blending\/batches\/([^/]+)\/(configure|prepare|advance)$/.exec(path);
  if (method !== 'POST' || !batchAdmin) return;
  const user = admin(c), batch = batchFor(c, batchAdmin[1]), season = db.get('SELECT * FROM blend_seasons WHERE id=?', batch.season_id);
  if (batchAdmin[2] === 'configure') {
    transaction(() => {
      const fresh = batchFor(c, batch.id); revision(c, fresh.revision);
      if (fresh.status !== 'accepting') fail(409, 'A prepared judging batch cannot be reconfigured.');
      const input = batchInput(c, season, fresh);
      const entries = db.get("SELECT COUNT(*) n FROM blend_recipes WHERE batch_id=? AND status='submitted'", batch.id).n;
      if (entries && (input.closesAt < fresh.closes_at || input.stage !== fresh.stage || input.slots !== fresh.slots)) fail(409, 'Do not shorten an accepted deadline or change promised qualification places.');
      if (input.capacity < entries) fail(409, 'Capacity cannot remove accepted entries.');
      db.run('UPDATE blend_batches SET name=?,stage=?,closes_at=?,slots=?,capacity=?,judges=?,revision=revision+1 WHERE id=?', input.name, input.stage, input.closesAt, input.slots, input.capacity, JSON.stringify(input.judges), batch.id);
      audit(c, user, 'batch.configured', {batchId: batch.id});
    });
    return json(res, 200, {ok: true});
  }
  if (batchAdmin[2] === 'prepare') {
    let eventCode;
    transaction(() => {
      const fresh = batchFor(c, batch.id); revision(c, fresh.revision);
      if (fresh.status !== 'accepting' || fresh.closes_at > now()) fail(409, 'Wait for the published recipe deadline before preparing the blind flight.');
      const entries = db.all("SELECT r.*,t.owner_user_id FROM blend_recipes r JOIN blend_teams t ON t.id=r.team_id WHERE r.batch_id=? AND r.status='submitted'", batch.id);
      if (entries.length < 2) fail(409, 'At least two submitted blends are needed. Extend the intake deadline or recruit more teams.');
      if (fresh.stage === 'final' && entries.some(r => !db.get('SELECT 1 FROM blend_qualifications WHERE season_id=? AND team_id=?', season.id, r.team_id))) fail(409, 'Only qualified teams can enter the championship.');
      const judges = decoded(fresh.judges);
      if (judges.some(j => entries.some(r => r.owner_user_id === j.userId))) fail(409, 'A judge cannot score a batch containing their own team.');
      for (let i = entries.length - 1; i > 0; i--) { const j = randomInt(i + 1); [entries[i], entries[j]] = [entries[j], entries[i]]; }
      const eventId = id(); eventCode = 'BG-' + c.token(6).toUpperCase();
      db.run('INSERT INTO tasting_events(id,code,name,status,scoring_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?)', eventId, eventCode, fresh.name + (season.is_test ? ' · Test event' : ''), 'open', 'proof-trials-v1', now(), now());
      entries.forEach((recipe, i) => {
        const entryId = id();
        db.run('INSERT INTO tasting_entries(id,event_id,seed,name,story) VALUES(?,?,?,?,?)', entryId, eventId, i + 1, 'Sample ' + (101 + i), 'Blind blend. Identity is hidden until its result is published.');
        db.run('UPDATE blend_recipes SET entry_id=? WHERE id=?', entryId, recipe.id); recipe.entryId = entryId;
      });
      for (let i = 0; i < entries.length; i += 2) db.run('INSERT INTO tasting_matchups(id,event_id,round,slot,entry_a_id,entry_b_id) VALUES(?,?,?,?,?,?)', id(), eventId, 1, Math.floor(i / 2) + 1, entries[i].entryId, entries[(i + 1) % entries.length].entryId);
      for (const judge of judges) {
        const judgeId = id();
        db.run('INSERT INTO tasting_judges VALUES(?,?,?)', judgeId, eventId, judge.name);
        db.run('INSERT INTO tasting_judge_users VALUES(?,?,?)', judgeId, judge.userId, now());
      }
      db.run('INSERT INTO tasting_event_operators VALUES(?,?,?)', eventId, user.id, now());
      db.run("UPDATE blend_batches SET status='prepared',event_id=?,revision=revision+1 WHERE id=?", eventId, batch.id);
      audit(c, user, 'flight.prepared', {batchId: batch.id, eventId, entries: entries.length});
    });
    return json(res, 201, {ok: true, eventCode});
  }
  let qualification = null;
  transaction(() => {
    const fresh = batchFor(c, batch.id);
    if (fresh.status !== 'prepared') fail(409, 'Prepare this judging flight first.');
    const event = db.get('SELECT * FROM tasting_events WHERE id=?', fresh.event_id); revision(c, event.state_revision);
    const action = c.choice(b.action, ['open', 'close', 'reveal', 'complete'], 'show action');
    const matchups = db.all('SELECT * FROM tasting_matchups WHERE event_id=? ORDER BY round,slot', event.id);
    const active = matchups.find(m => m.id === event.active_matchup_id);
    let phase = event.phase, activeId = event.active_matchup_id, deadline = null;
    if (action === 'open') {
      if (!['lobby', 'results'].includes(event.phase)) fail(409, 'Finish the current prediction round before opening another.');
      const next = matchups.find(m => !db.get('SELECT 1 FROM tasting_outcomes WHERE matchup_id=?', m.id));
      if (!next || next.predictions_locked_at !== null) fail(409, 'No unopened prediction round remains.');
      const seconds = c.integer(b.seconds ?? 120, 'Prediction window in seconds', 15, 3600);
      phase = 'predictions'; activeId = next.id; deadline = now() + seconds * 1000;
    } else if (action === 'close') {
      if (event.phase !== 'predictions' || !active) fail(409, 'There is no open prediction window.');
      db.run('UPDATE tasting_matchups SET predictions_locked_at=COALESCE(predictions_locked_at,?) WHERE id=?', now(), active.id);
      phase = 'judging';
    } else if (action === 'reveal') {
      if (event.phase !== 'judging' || !active || active.predictions_locked_at === null) fail(409, 'Close predictions before revealing a result.');
      const all = scoredEntries(c, fresh);
      if (!all.length || !all.every(r => r.ready)) fail(409, 'Every judge must lock every scorecard before the first reveal.');
      const a = all.find(r => r.entryId === active.entry_a_id), other = all.find(r => r.entryId === active.entry_b_id);
      const comparison = compareVectors(a.vector, other.vector);
      if (!comparison) fail(409, 'Exact blind-score tie. Run a separate blind tie-break; the software will not invent a winner.');
      for (const card of a.cards) {
        const rival = other.cards.find(s => s.judge_id === card.judge_id);
        const vector = s => [CRITERIA.reduce((n, key) => n + s[key], 0), s.palate, s.balance, s.finish, s.aroma];
        const pick = compareVectors(vector(card), vector(rival));
        if (pick) db.run('INSERT INTO tasting_judge_submissions VALUES(?,?,?,?)', active.id, card.judge_id, pick < 0 ? a.entryId : other.entryId, now());
      }
      db.run('INSERT INTO tasting_outcomes(matchup_id,winner_entry_id,revision,published_at) VALUES(?,?,1,?)', active.id, comparison < 0 ? a.entryId : other.entryId, now());
      phase = 'results';
    } else {
      if (event.phase !== 'results' || matchups.some(m => !db.get('SELECT 1 FROM tasting_outcomes WHERE matchup_id=?', m.id))) fail(409, 'Reveal every prediction round before completing this flight.');
      qualification = advanceQualifications(c, fresh);
      db.run("UPDATE blend_batches SET status='complete',resolution_note=?,revision=revision+1 WHERE id=?", qualification.pendingTie ? 'An exact tie affects the remaining qualification places. A separate blind tie-break is required; those places have not been awarded.' : '', batch.id);
      phase = 'complete'; activeId = null;
    }
    db.run('UPDATE tasting_events SET phase=?,status=?,active_matchup_id=?,phase_deadline=?,state_revision=state_revision+1,updated_at=? WHERE id=?', phase, phase === 'complete' ? 'final' : 'live', activeId, deadline, now(), event.id);
    audit(c, user, 'show.' + action, {batchId: batch.id, eventId: event.id, revision: event.state_revision + 1, qualification});
  });
  return json(res, 200, {ok: true, qualification});
}
