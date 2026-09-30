import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SHOW_EPISODES,SHOW_CHANNEL,youtubeEmbed} from '../apps/web/public/game-media.mjs';
import {createOpenBlendingPreview} from '../apps/server/blending-open-preview.mjs';

test('media source is a finite verified MIXX TANK series, not a guessed stream or arbitrary iframe',()=>{
 assert.equal(SHOW_EPISODES.length,4);
 assert.equal(SHOW_CHANNEL,'https://www.youtube.com/@MixxTankProductions');
 for(const e of SHOW_EPISODES){const url=new URL(youtubeEmbed(e.id,'https://example.test'));assert.equal(url.origin,'https://www.youtube-nocookie.com');assert.equal(url.searchParams.get('playsinline'),'1');assert.equal(url.searchParams.get('origin'),'https://example.test');}
 for(const id of ['unknown','https://bad.example','<img src=x>']) assert.throws(()=>youtubeEmbed(id,'https://example.test'));
});
test('isolated preview serves brand/media assets and narrowly permits YouTube frames only on game pages',async t=>{
 const app=createOpenBlendingPreview({BLENDING_OPEN_PREVIEW:'true',NODE_ENV:'test'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());
 const base='http://127.0.0.1:'+app.server.address().port;
 for(const [path,mime] of [['/game-media.mjs','text/javascript'],['/game-media.css','text/css'],['/bg-media/bourbon-games.png','image/png'],['/bg-media/mixx-tank.png','image/png']]){const r=await fetch(base+path);assert.equal(r.status,200,path);assert.ok(r.headers.get('content-type').startsWith(mime));}
 for(const path of ['/blending/TRYBG','/games/BGDEMO']){const r=await fetch(base+path);const csp=r.headers.get('content-security-policy');assert.match(csp,/frame-src https:\/\/www.youtube-nocookie.com;/);assert.match(csp,/script-src 'self';/);assert.ok(!csp.includes('unsafe-inline'));}
 const data=await(await fetch(base+'/api/public/games/BGDEMO')).json();assert.equal(data.event.format,'blending');assert.equal(data.event.seasonCode,'TRYBG');
 assert.equal((await fetch(base+'/api/admin/users')).status,404);
});
