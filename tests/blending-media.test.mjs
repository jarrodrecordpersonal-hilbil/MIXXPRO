import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpenBlendingPreview} from '../apps/server/blending-open-preview.mjs';
import {createApplication,configuration} from '../apps/server/app.mjs';
import {EPISODES,videoUrl} from '../apps/web/public/bg-media/episodes.mjs';
async function running(t, preview=true) {
 const app=preview?createOpenBlendingPreview({BLENDING_OPEN_PREVIEW:'true',NODE_ENV:'test'}):createApplication({config:configuration({DB_PATH:':memory:',NODE_ENV:'test',BLENDING_GAMES_ENABLED:'true'})});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>app.close());
 return 'http://127.0.0.1:'+app.server.address().port;
}
test('only verified MIXX TANK episodes are accepted, with normal YouTube controls',()=>{
 assert.equal(EPISODES.length,4);assert.equal(new Set(EPISODES.map(e=>e.id)).size,4);
 for(const e of EPISODES){const url=new URL(videoUrl(e.id,true));assert.equal(url.origin,'https://www.youtube-nocookie.com');assert.equal(url.searchParams.get('controls'),'1');assert.equal(url.searchParams.get('playsinline'),'1');assert.ok(!url.searchParams.has('modestbranding'));}
 for(const id of ['bad','javascript:alert(1)','../admin','"><img src=x>'])assert.throws(()=>videoUrl(id));
});
test('both applications serve actual PNG marks and permit only the intended media hosts',async t=>{
 for(const preview of [true,false]){
  const base=await running(t,preview);
  for(const name of ['mixx-tank','bourbon-games']){const r=await fetch(base+'/bg-media/'+name+'.png');assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');assert.equal(Buffer.from(await r.arrayBuffer()).subarray(0,8).toString('hex'),'89504e470d0a1a0a');}
  const page=await fetch(base+'/blending/TRYBG?view=results');const csp=page.headers.get('content-security-policy');
  assert.match(csp,/frame-src https:\/\/www.youtube-nocookie.com;/);assert.match(csp,/img-src 'self' data: https:\/\/i.ytimg.com;/);assert.ok(!csp.includes('unsafe-inline'));assert.ok(!csp.includes('*'));
 }
});
test('sharing metadata is branded, static and free of unpublished game results or query injection',async t=>{
 const base=await running(t), r=await fetch(base+'/blending/TRYBG?view=results&evil=%22%3E%3Cscript%3E'),html=await r.text();
 assert.match(html,/og:site_name.*Bourbon Games · MIXX TANK/);assert.match(html,/og:image.*Lp71Y_h9ZmM/);assert.match(html,/\/bg-media\/bourbon-games.png/);
 assert.ok(!html.includes('<iframe'));assert.ok(!html.includes('evil='));assert.match(html,/Season 1 replays/);assert.match(html,/prizes and results are separate/);
});
test('media static routes do not expose local files or remove normal judge authorization',async t=>{
 for(const preview of [true,false]){
  const base=await running(t,preview);
  for(const path of ['/bg-media/private.png','/bg-media/episodes.json','/bg-media/.env'])assert.equal((await fetch(base+path)).status,404);
  if(!preview)assert.equal((await fetch(base+'/api/blending/judging')).status,401);
 }
});
