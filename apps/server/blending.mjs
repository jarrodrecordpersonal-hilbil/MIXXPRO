/** Blending competition data, separate from the audience points projection. */
import {scoreRows} from './game-standings.mjs';
import {gameAccountView} from './game-identity.mjs';
import {eventView} from './routes/games.mjs';

export const STAGES = {
  round1: 'Round 1 · late 2026', round2: 'Round 2 · first half of 2027',
  'last-chance': 'Last-chance qualification', final: 'Championship · Q4 2027'
};
export const CRITERIA = ['aroma', 'palate', 'balance', 'finish'];
export const SCORING = 'Each judge scores aroma, palate, balance and finish from 0–25. The panel average determines blend standings. Ties compare palate, then balance, then finish, then aroma. An exact remaining tie requires a separate blind tie-break; no automatic place is awarded.';
export const decoded = value => JSON.parse(value);
export const enabled = c => c.config.DEMO_MODE || c.config.BLENDING_GAMES_ENABLED === true;
export function seasonFor(c, code) {
  const season = c.db.get('SELECT * FROM blend_seasons WHERE code=?', code);
  if (!season) c.fail(404, 'Blending season not found.');
  return season;
}
export function batchFor(c, id) {
  const batch = c.db.get('SELECT * FROM blend_batches WHERE id=?', id);
  if (!batch) c.fail(404, 'Judging batch not found.');
  return batch;
}
export function revision(c, actual) {
  if (!Number.isInteger(c.b.expectedRevision) || c.b.expectedRevision !== actual)
    c.fail(409, 'This has changed. Refresh and review before saving.');
}
export function validComponents(c, input) {
  if (!Array.isArray(input) || input.length < 2 || input.length > 8) c.fail(400, 'Add 2–8 whiskey components.');
  const out = input.map(row => ({
    code: c.text(row?.code, 'Component code', 12).toUpperCase(),
    name: c.text(row?.name, 'Component name and batch', 100)
  }));
  if (out.some(row => !/^[A-Z0-9_-]+$/.test(row.code)) || new Set(out.map(row => row.code)).size !== out.length)
    c.fail(400, 'Use unique component codes containing letters, numbers, underscores or dashes.');
  return out;
}
export function validRecipe(c, components, input, submit) {
  if (!Array.isArray(input) || input.length !== components.length) c.fail(400, 'Include every specified component once.');
  const codes = new Set();
  const rows = input.map(row => {
    if (!row || !components.some(component => component.code === row.code) || codes.has(row.code)) c.fail(400, 'Recipe contains an unknown or repeated component.');
    codes.add(row.code);
    if (!Number.isInteger(row.bps) || row.bps < 0 || row.bps > 10000) c.fail(400, 'Use component percentages between 0 and 100, with at most two decimal places.');
    return {code: row.code, bps: row.bps};
  });
  const sum = rows.reduce((n, row) => n + row.bps, 0);
  if (sum > 10000 || (submit && sum !== 10000)) c.fail(400, 'Your submitted blend must total exactly 100%.');
  return rows.sort((a, b) => a.code.localeCompare(b.code));
}
export function validJudges(c, input) {
  if (!Array.isArray(input) || input.length < 2 || input.length > 7) c.fail(400, 'Assign 2–7 independent judges.');
  const roster = input.map(row => {
    const name = c.text(row?.name, 'Judge display name', 50);
    const email = c.text(row?.email, 'Judge account email', 254).toLowerCase();
    const user = c.db.get('SELECT id FROM users WHERE email=?', email);
    if (!user) c.fail(400, `Create the account for ${name} before assigning the judge.`);
    return {name, userId: user.id};
  });
  if (new Set(roster.map(j => j.userId)).size !== roster.length || new Set(roster.map(j => j.name.toLowerCase())).size !== roster.length)
    c.fail(400, 'Each judge needs a distinct account and display name.');
  return roster;
}
export function teamFor(c, seasonId, user = c.readSession(c.req)) {
  return user ? c.db.get('SELECT * FROM blend_teams WHERE season_id=? AND owner_user_id=?', seasonId, user.id) : null;
}
export function intakeTarget(c, season, team = teamFor(c, season.id)) {
  const qualified = team && c.db.get('SELECT 1 FROM blend_qualifications WHERE season_id=? AND team_id=?', season.id, team.id);
  const batches = c.db.all("SELECT * FROM blend_batches WHERE season_id=? AND status='accepting' AND closes_at>? ORDER BY closes_at,created_at,id", season.id, c.now());
  const finalLocked = c.db.get("SELECT 1 FROM blend_batches WHERE season_id=? AND stage='final' AND status!='accepting'", season.id);
  const batch = batches.find(row => {
    if (finalLocked) return false;
    if ((row.stage === 'final') !== !!qualified) return false;
    if (team && c.db.get("SELECT 1 FROM blend_recipes WHERE team_id=? AND batch_id=? AND status!='draft'", team.id, row.id)) return false;
    return c.db.get("SELECT COUNT(*) n FROM blend_recipes WHERE batch_id=? AND status='submitted'", row.id).n < row.capacity;
  });
  if (!batch) return {
    key: 'next-competition', batchId: null, name: qualified ? 'Next championship entry window' : 'Next competition intake',
    closesAt: null, stage: qualified ? 'final' : null, slots: 0,
    explanation: qualified ? 'Your championship place is saved. This entry will wait for the next championship intake; no date is promised yet.' : 'Current entry windows are closed or full. Your blend goes into the next-competition queue, not the locked championship. Dates are not set yet.'
  };
  return {key: batch.id, batchId: batch.id, name: batch.name, closesAt: batch.closes_at, stage: batch.stage, slots: batch.slots,
    explanation: batch.stage === 'final' ? 'A fresh championship blend. Earlier scores do not carry into the final.' : batch.slots ? `${batch.slots} championship place${batch.slots === 1 ? '' : 's'} available in this judging batch.` : 'A scored practice batch; no championship places are awarded in this batch.'};
}
export function assertTarget(c, target) {
  if (c.b.expectedTarget !== target.key) c.fail(409, 'The entry window changed. Review your next judging batch and submit again.');
  if (!target.batchId && c.b.acceptQueue !== true) c.fail(400, 'Confirm the clearly labeled next-competition queue before submitting.');
}
function scoreVector(cards) {
  const totals = CRITERIA.map(key => cards.reduce((sum, card) => sum + card[key], 0));
  return [totals.reduce((sum, n) => sum + n, 0), totals[1], totals[2], totals[3], totals[0]];
}
export function compareVectors(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i] ? -1 : 1;
  return 0;
}
export function scoredEntries(c, batch) {
  const judgeCount = c.db.get('SELECT COUNT(*) n FROM tasting_judges WHERE event_id=?', batch.event_id).n;
  const entries = c.db.all('SELECT r.id AS recipeId,r.entry_id AS entryId,r.team_id AS teamId,r.blend_name AS blendName,t.name AS teamName,e.name AS sample FROM blend_recipes r JOIN blend_teams t ON t.id=r.team_id JOIN tasting_entries e ON e.id=r.entry_id WHERE r.batch_id=?', batch.id);
  return entries.map(entry => {
    const cards = c.db.all('SELECT s.* FROM blend_scorecards s JOIN tasting_judges j ON j.id=s.judge_id WHERE s.entry_id=? AND j.event_id=? AND s.locked_at IS NOT NULL', entry.entryId, batch.event_id);
    const ready = judgeCount >= 2 && cards.length === judgeCount;
    return {...entry, cards, ready, vector: scoreVector(cards), average: ready ? Math.round(scoreVector(cards)[0] * 100 / judgeCount) / 100 : null};
  }).sort((a, b) => compareVectors(a.vector, b.vector) || a.entryId.localeCompare(b.entryId));
}
export function officialRows(c, batch) {
  if (!batch.event_id) return [];
  const visible = new Set(c.db.all('SELECT m.entry_a_id a,m.entry_b_id b FROM tasting_outcomes o JOIN tasting_matchups m ON m.id=o.matchup_id WHERE m.event_id=?', batch.event_id).flatMap(m => [m.a, m.b]));
  let rank = 0, index = 0, previous;
  return scoredEntries(c, batch).filter(row => row.ready).map(row => {
    index++;
    if (!previous || compareVectors(previous, row.vector) !== 0) rank = index;
    previous = row.vector;
    return {...row, rank};
  }).filter(row => batch.status === 'complete' || visible.has(row.entryId)).map(row => ({
    entryId: row.entryId, sample: row.sample, teamName: row.teamName, blendName: row.blendName, average: row.average,
    rank: batch.status === 'complete' ? row.rank : null,
    qualified: !!c.db.get('SELECT 1 FROM blend_qualifications WHERE team_id=? AND batch_id=?', row.teamId, batch.id)
  }));
}
export function publicSeason(c, season) {
  const team = teamFor(c, season.id), user = c.readSession(c.req);
  const batches = c.db.all('SELECT * FROM blend_batches WHERE season_id=? ORDER BY closes_at,created_at,id', season.id);
  const current = batches.filter(batch => batch.event_id && batch.status === 'prepared')
    .sort((a, b) => (c.db.get('SELECT updated_at FROM tasting_events WHERE id=?', b.event_id).updated_at - c.db.get('SELECT updated_at FROM tasting_events WHERE id=?', a.event_id).updated_at))[0];
  const event = current ? c.db.get('SELECT * FROM tasting_events WHERE id=?', current.event_id) : null;
  const mostRecent = [...batches].reverse().find(batch => batch.event_id && (batch.status === 'complete' || officialRows(c, batch).length));
  const resultBatch = current || mostRecent;
  const round = resultBatch && c.db.get('SELECT o.matchup_id FROM tasting_outcomes o JOIN tasting_matchups m ON m.id=o.matchup_id WHERE m.event_id=? ORDER BY o.published_at DESC,m.slot DESC LIMIT 1', resultBatch.event_id);
  return {
    season: {code: season.code, name: season.name, revision: season.revision, isTest: !!season.is_test,
      components: decoded(season.components), stages: decoded(season.stage_rules), scoring: SCORING},
    account: gameAccountView(c, ''), canManage: user?.platform_role === 'admin',
    intake: intakeTarget(c, season, team), team: team ? {name: team.name, qualified: !!c.db.get('SELECT 1 FROM blend_qualifications WHERE team_id=?', team.id)} : null,
    myEntries: team ? c.db.all('SELECT r.id,r.blend_name AS blendName,r.recipe,r.components_snapshot AS components,r.status,r.revision,r.submitted_at AS submittedAt,b.name AS batchName,b.closes_at AS closesAt FROM blend_recipes r LEFT JOIN blend_batches b ON b.id=r.batch_id WHERE r.team_id=? ORDER BY r.created_at DESC', team.id).map(row => ({...row, recipe: decoded(row.recipe), components: decoded(row.components)})) : [],
    spotlight: event ? eventView(c.db, event) : null,
    batches: batches.map(batch => ({id: batch.id, name: batch.name, stage: batch.stage, closesAt: batch.closes_at, slots: batch.slots,
      status: batch.status, resolutionNote: batch.resolution_note, eventCode: batch.event_id ? c.db.get('SELECT code FROM tasting_events WHERE id=?', batch.event_id).code : null,
      judges: decoded(batch.judges).map(j => j.name), results: officialRows(c, batch)})),
    audience: resultBatch ? {eventCode: c.db.get('SELECT code FROM tasting_events WHERE id=?', resultBatch.event_id).code,
      eventStandings: scoreRows(c.db, resultBatch.event_id), roundStandings: round ? scoreRows(c.db, resultBatch.event_id, round.matchup_id) : []} : null,
    serverTime: c.now()
  };
}
export function advanceQualifications(c, batch) {
  if (batch.stage === 'final' || !batch.slots) return {awarded: 0, pendingTie: false};
  const candidates = scoredEntries(c, batch).filter(row => row.ready && !c.db.get('SELECT 1 FROM blend_qualifications WHERE season_id=? AND team_id=?', batch.season_id, row.teamId));
  let remaining = batch.slots, awarded = 0, pendingTie = false;
  while (candidates.length && remaining) {
    const group = [candidates.shift()];
    while (candidates.length && compareVectors(group[0].vector, candidates[0].vector) === 0) group.push(candidates.shift());
    if (group.length > remaining) { pendingTie = true; break; }
    for (const entry of group) c.db.run('INSERT INTO blend_qualifications VALUES(?,?,?,?)', batch.season_id, entry.teamId, batch.id, c.now());
    awarded += group.length; remaining -= group.length;
  }
  return {awarded, pendingTie};
}
