import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('main page presents MIXXWAVE immediately and loads presentation polish',()=>{
  const html=read('apps/web/public/index.html');
  assert.match(html,/<title>MIXXWAVE · Your room\. Your MIXX\.<\/title>/);
  assert.match(html,/Opening MIXXWAVE/);
  assert.match(html,/src="\/polish\.mjs"/);
});

test('polish keeps MIXDATA separate, exposes setup actions and a catalog browser',()=>{
  const script=read('apps/web/public/polish.mjs');
  for(const copy of ['Choose the MIXX','Pick the look','Connect the TV','Open MIXDATA','Browse videos','Browse available videos'])assert.match(script,new RegExp(copy));
  assert.match(script,/page==='mixdata'/);
  assert.match(script,/location\.href='\/screens'/);
  assert.match(script,/MIXXTANK for venues','MIXXWAVE for venues'/);
  assert.match(script,/fetch\('\/api\/config'/);
  assert.match(script,/fetch\('\/api\/catalog'/);
});

test('runtime, generated administrator and docs use MIXXWAVE venue-facing terminology',()=>{
  const main=read('apps/server/main.mjs'),admin=read('scripts/admin.mjs'),readme=read('README.md');
  assert.match(main,/MIXXWAVE \$\{app\.config\.DEMO_MODE/);
  assert.doesNotMatch(main,/MIXXPRO/);
  assert.match(admin,/MIXXWAVE Administrator/);
  assert.match(readme,/^# MIXXWAVE · MIXXTANK for venues/m);
  assert.match(readme,/\*\*MIXDATA\*\* is its screen-analytics surface/);
});
