/** Disposable demo server used by browser tests and local previews. Never a deployment entrypoint. */
import {writeFileSync, existsSync} from 'node:fs';
import {blendingFixture} from './helpers/blending.mjs';
if (process.env.NODE_ENV === 'production') throw Error('Do not run test fixtures in production.');
if (process.env.DB_PATH && process.env.DB_PATH !== ':memory:' && existsSync(process.env.DB_PATH)) throw Error('Use a new, disposable test database path. Existing files are not modified.');
const f = await blendingFixture(null, {port:Number(process.env.PORT || 3359), dbPath:process.env.DB_PATH || ':memory:'});
const event = await f.prepare();
await f.scoreAll(f.first, false, true);
const task = (await f.request('/api/blending/judging',undefined,f.judges[0])).body.tasks[0];
const missing = task.entries[0], recipe = f.app.db.get('SELECT team_id FROM blend_recipes WHERE entry_id=?',missing.id);
const owner = f.app.db.get('SELECT owner_user_id FROM blend_teams WHERE id=?',recipe.team_id).owner_user_id;
const score = 24 - f.teams.findIndex(team => team.id === owner);
const info = {base:f.base, code:'BLEND26', eventCode:event.code, first:f.first, second:f.second,
  producer:{email:f.producer.email,password:f.producer.password}, judges:f.judges.map(j=>({name:j.name,email:j.email,password:j.password})),
  missingCard:{sample:missing.sample,score}, testDataOnly:true};
if(process.env.BG_FIXTURE_INFO)writeFileSync(process.env.BG_FIXTURE_INFO,JSON.stringify(info,null,2));
console.log('BLENDING_PILOT_READY '+JSON.stringify(info));
process.once('SIGTERM',async()=>{await f.app.close();process.exit(0);});
process.once('SIGINT',async()=>{await f.app.close();process.exit(0);});
