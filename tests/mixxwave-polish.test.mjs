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

test('polish keeps MIXDATA separate and exposes four simple setup actions',()=>{
  const script=read('apps/web/public/polish.mjs');
  for(const copy of ['Choose the MIXX','Pick the look','Connect the TV','Open MIXDATA'])assert.match(script,new RegExp(copy));
  assert.match(script,/page==='mixdata'/);
  assert.match(script,/location\.href='\/screens'/);
  assert.match(script,/MIXXTANK for venues','MIXXWAVE for venues'/);
  assert.doesNotMatch(script,/fetch\(|\/api\//);
});

test('runtime and generated administrator defaults use MIXXWAVE',()=>{
  const main=read('apps/server/main.mjs'),admin=read('scripts/admin.mjs');
  assert.match(main,/MIXXWAVE \$\{app\.config\.DEMO_MODE/);
  assert.doesNotMatch(main,/MIXXPRO/);
  assert.match(admin,/MIXXWAVE Administrator/);
});
