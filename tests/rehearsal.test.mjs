import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fresh,restore,advance,phase,choose,score,remaining} from '../apps/web/public/rehearsal/engine.mjs';
import {byteRange} from '../apps/server/routes/rehearsal.mjs';
import {createOpenBlendingPreview} from '../apps/server/blending-open-preview.mjs';
import {createApplication,configuration} from '../apps/server/app.mjs';
const e=JSON.parse(readFileSync(new URL('../apps/web/public/rehearsal/episode.json',import.meta.url)));
test('cue sheet covers exactly 90 seconds and agrees with question, lock and reveal scenes',()=>{
 assert.equal(e.duration,90);assert.equal(e.mode,'practice');assert.equal(e.scenes[0].start,0);assert.equal(e.scenes.at(-1).end,90);
 e.scenes.slice(1).forEach((c,i)=>assert.equal(c.start,e.scenes[i].end));
 for(const [scene,field] of [['question','open'],['locked','close'],['reveal','reveal']])assert.equal(e.scenes.find(c=>c.kind===scene).start,e.question[field]);
 assert.equal(e.question.close-e.question.open,20);assert.equal(e.question.choices.length,2);
 assert.ok(e.question.choices.some(c=>c.id===e.question.correct));
});
test('answers open and close at exact media-time boundaries, never before or after',()=>{
 let s=fresh(e);assert.equal(phase(e,s),'intro');assert.equal(choose(e,s,'101').pick,null);
 s=advance(e,s,33.999);assert.equal(phase(e,s),'intro');
 s=advance(e,s,34);assert.equal(phase(e,s),'question');assert.equal(remaining(e,s),20);
 s=choose(e,s,'101');assert.equal(s.pick,'101');
 s=advance(e,s,53.999);assert.equal(remaining(e,s),1);s=choose(e,s,'102');assert.equal(s.pick,'102');
 s=advance(e,s,54);assert.equal(phase(e,s),'locked');assert.strictEqual(choose(e,s,'101'),s);assert.equal(score(e,s),0);
});
test('pausing changes no media time, question deadline or answer; invalid IDs are rejected',()=>{
 let s=advance(e,fresh(e),40),later=advance(e,s,40);assert.deepEqual(later,s);assert.equal(remaining(e,later),14);
 assert.strictEqual(choose(e,s,'<script>'),s);
});
test('seeking past a lock and rewinding does not reopen this run',()=>{
 let s=choose(e,advance(e,fresh(e),40),'101');s=advance(e,s,62);assert.equal(score(e,s),0);
 s=advance(e,s,40);assert.equal(phase(e,s),'locked');assert.equal(choose(e,s,'102').pick,'101');
});
test('skipping straight to a reveal never manufactures a pick or point',()=>{
 let s=advance(e,fresh(e),75);assert.equal(s.pick,null);assert.equal(score(e,s),0);s=advance(e,s,38);assert.equal(phase(e,s),'locked');
});
test('correct pick scores only once on reveal; replay does not accumulate points',()=>{
 let s=choose(e,advance(e,fresh(e),40),'102');s=advance(e,s,61.999);assert.equal(score(e,s),0);
 s=advance(e,s,62);assert.equal(score(e,s),1);
 for(const t of [80,90,40,62,80]){s=advance(e,s,t);assert.equal(score(e,s),1);}
 assert.equal(score(e,fresh(e)),0);
});
test('refresh restores this tab state, but rejects corrupt or mismatched storage',()=>{
 const s=choose(e,advance(e,fresh(e),43),'102');assert.deepEqual(restore(e,JSON.parse(JSON.stringify(s))),s);
 for(const v of [null,{}, {...s,version:999},{...s,position:-1},{...s,position:NaN},{...s,seenTo:1000}])assert.deepEqual(restore(e,v),fresh(e));
 assert.equal(restore(e,{...s,pick:'bad'}).pick,null);
});
test('media range support includes full, partial, open and suffix ranges',()=>{
 assert.deepEqual(byteRange(undefined,100),{start:0,end:99,status:200});
 assert.deepEqual(byteRange('bytes=0-1',100),{start:0,end:1,status:206});
 assert.deepEqual(byteRange('bytes=90-',100),{start:90,end:99,status:206});
 assert.deepEqual(byteRange('bytes=-20',100),{start:80,end:99,status:206});
 assert.deepEqual(byteRange('bytes=50-200',100),{start:50,end:99,status:206});
 for(const range of ['bytes=100-','bytes=5-4','bytes=-0','bytes=-','bytes=0-1,4-5','nonsense','bytes=9007199254740992-'])assert.equal(byteRange(range,100),null);
});
async function serve(t,preview=true,enabled=true){
 const app=preview?createOpenBlendingPreview({BLENDING_OPEN_PREVIEW:'true',NODE_ENV:'test'}):createApplication({config:configuration({NODE_ENV:'test',DB_PATH:':memory:',BLENDING_GAMES_ENABLED:String(enabled)})});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>app.close());return {app,base:'http://127.0.0.1:'+app.server.address().port};
}
test('no-login practice serves its own assets and has no writable live-results API',async t=>{
 const {base,app}=await serve(t);const before=app.config.DB_PATH;assert.equal(before,':memory:');
 for(const [path,type] of [['/rehearsal','text/html'],['/rehearsal/engine.mjs','text/javascript'],['/rehearsal/episode.json','application/json']]){
  const response=await fetch(base+path);assert.equal(response.status,200);assert.ok(response.headers.get('content-type').startsWith(type));
  assert.equal(response.headers.get('set-cookie'),null);assert.match(response.headers.get('content-security-policy'),/media-src 'self'/);
 }
 for(const path of ['/rehearsal/.env','/rehearsal/nope.json','/api/rehearsal/submit'])assert.equal((await fetch(base+path)).status,404);
 const meta=(await(await fetch(base+'/api/open-preview')).json());
 const response=await fetch(base+'/rehearsal/submit',{method:'POST',headers:{Origin:'http://localhost:3000','Content-Type':'application/json','X-CSRF-Token':meta.csrf},body:'{}'});
 assert.equal(response.status,404);
 assert.equal((await(await fetch(base+'/api/public/games/BGDEMO')).json()).standings.length,0);
});
test('normal game authorization and feature-disabled state remain protected',async t=>{
 for(const enabled of [true,false]){
  const {base,app}=await serve(t,false,enabled);assert.equal((await fetch(base+'/rehearsal')).status,enabled?200:404);
  assert.equal((await fetch(base+'/api/blending/judging')).status,enabled?401:404);
  assert.equal(app.db.get('SELECT COUNT(*) n FROM users').n,0);
 }
});
