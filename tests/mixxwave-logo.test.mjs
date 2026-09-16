import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApplication,configuration} from '../apps/server/app.mjs';

test('venue chrome uses the MIXXWAVE mark while MIXDATA remains separate',()=>{
  const link=readFileSync(new URL('../apps/web/screens/link.mjs',import.meta.url),'utf8');
  const logo=readFileSync(new URL('../apps/web/public/mixxwave-logo.svg',import.meta.url),'utf8');
  assert.match(link,/MIXXWAVE/);assert.match(link,/mixxwave-logo\.svg/);assert.match(link,/MIXDATA/);
  assert.match(logo,/<title id="title">MIXX WAVE<\/title>/);assert.match(logo,/fill="#FFFFFF"/);
});

test('MIXXWAVE logo is served as SVG by the application',async()=>{
  const app=createApplication({config:configuration({DB_PATH:':memory:',APP_SECRET:'test-only-mixxwave-logo-secret-2026'})});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  try{const r=await fetch(`http://127.0.0.1:${app.server.address().port}/mixxwave-logo.svg`);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/image\/svg\+xml/);assert.match(await r.text(),/MIXX WAVE/);}finally{await app.close();}
});
