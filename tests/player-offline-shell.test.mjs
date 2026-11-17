import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('offline shell caches every imported player module and uses matching versioned paths',()=>{
  const sw=readFileSync('apps/player/public/sw.js','utf8');
  const player=readFileSync('apps/player/public/player.mjs','utf8');
  const html=readFileSync('apps/player/public/index.html','utf8');
  const imports=[...player.matchAll(/import\s+[^;]+from\s+['"]([^'"]+)['"]/g)]
    .map(m=>m[1]).filter(p=>p.startsWith('./'))
    .map(p=>'/player/'+p.slice(2));
  for(const path of imports) assert.ok(sw.includes("'"+path+"'"),'Missing offline import '+path);
  assert.match(sw,/const CACHE='mixxpro-player-shell-v9'/);
  assert.match(player,/register\('\/player\/sw\.js\?v=9'/);
  assert.match(html,/src="\/player\/player\.mjs\?v=9"/);
});
