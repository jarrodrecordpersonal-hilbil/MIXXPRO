import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('MIXX MEASURE names the analytics page, navigation and CSV exports',()=>{
  assert.match(source('apps/web/screens/index.html'),/<title>MIXX MEASURE · Screen activity<\/title>/);
  assert.match(source('apps/web/screens/link.mjs'),/a\.textContent='MIXX MEASURE'/);
  const app=source('apps/web/screens/app.mjs');
  assert.match(app,/aria-label="MIXX MEASURE"/);
  assert.match(app,/MIXX MEASURE · SCREEN ANALYTICS/);
  assert.match(app,/MIXX MEASURE-screen-activity-page-/);
  assert.doesNotMatch(app,/MIXX?PLAY/i);
});
test('MIXX MEASURE branding leaves analytics endpoints and media playback separate',()=>{
  assert.match(source('apps/web/screens/link.mjs'),/a\.href='\/screens'/);
  assert.match(source('apps/web/screens/app.mjs'),/\/screen-activity\?/);
  assert.match(source('apps/web/public/index.html'),/\/screens-link\.mjs/);
  assert.doesNotMatch(source('apps/player/public/player.mjs'),/MIXX MEASURE/);
});
