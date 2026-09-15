import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('MIXDATA names the analytics page, navigation and CSV exports',()=>{
  assert.match(source('apps/web/screens/index.html'),/<title>MIXDATA · Screen activity<\/title>/);
  assert.match(source('apps/web/screens/link.mjs'),/a\.textContent='MIXDATA'/);
  const app=source('apps/web/screens/app.mjs');
  assert.match(app,/aria-label="MIXDATA"/);
  assert.match(app,/MIXDATA · SCREEN ANALYTICS/);
  assert.match(app,/MIXDATA-screen-activity-page-/);
  assert.doesNotMatch(app,/MIXX?PLAY/i);
});
test('MIXDATA branding leaves analytics endpoints and media playback separate',()=>{
  assert.match(source('apps/web/screens/link.mjs'),/a\.href='\/screens'/);
  assert.match(source('apps/web/screens/app.mjs'),/\/screen-activity\?/);
  assert.match(source('apps/web/public/index.html'),/\/screens-link\.mjs/);
  assert.doesNotMatch(source('apps/player/public/player.mjs'),/MIXDATA/);
});
