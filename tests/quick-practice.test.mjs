import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fresh,restore,advance,phase,choose,score} from '../apps/web/public/rehearsal/engine.mjs';
import {createOpenBlendingPreview} from '../apps/server/blending-open-preview.mjs';
const e=JSON.parse(readFileSync(new URL('../apps/web/public/rehearsal/episode.json',import.meta.url)));
async function serve(t){
 const app=createOpenBlendingPreview({BLENDING_OPEN_PREVIEW:'true',NODE_ENV:'test'});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>app.close());
 return {base:'http://127.0.0.1:'+app.server.address().port};
}
test('default practice has immediate picks and no media; video timing is explicitly separate',async t=>{
 const {base}=await serve(t);
 const html=await(await fetch(base+'/rehearsal')).text();
 assert.match(html,/quick\.mjs/);assert.match(html,/id="reveal"/);assert.match(html,/data-choice="101"/);
 assert.ok(!/<(?:video|audio|iframe)\b/.test(html));assert.ok(!html.includes('episode.mp4'));
 const timed=await(await fetch(base+'/rehearsal?mode=video')).text();
 assert.match(timed,/Silent storyboard/);assert.match(timed,/<video[^>]* muted/);
 for(const path of ['/rehearsal/quick.mjs','/rehearsal/quick.css'])assert.equal((await fetch(base+path)).status,200);
 const unknown=await(await fetch(base+'/rehearsal?mode=../../.env')).text();assert.match(unknown,/quick\.mjs/);
});
test('quick testing uses a separate storage key and the same bounded one-point engine',()=>{
 let s=advance(e,fresh(e),e.question.open);assert.equal(phase(e,s),'question');
 s=choose(e,s,'102');assert.equal(score(e,s),0);s=advance(e,s,e.question.reveal);assert.equal(score(e,s),1);
 assert.equal(choose(e,s,'101').pick,'102');assert.equal(score(e,restore(e,JSON.parse(JSON.stringify(s)))),1);
 const source=readFileSync(new URL('../apps/web/public/rehearsal/quick.mjs',import.meta.url),'utf8');
 assert.match(source,/:quick:v/);assert.ok(!source.includes('/api/'));assert.ok(!source.includes('setInterval'));assert.ok(!source.includes('speechSynthesis'));
});
