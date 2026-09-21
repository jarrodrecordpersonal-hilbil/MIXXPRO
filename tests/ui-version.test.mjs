import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {uiVersion} from '../apps/server/ui-version.mjs';
import {createApplication,configuration} from '../apps/server/app.mjs';

test('UI fingerprint is stable across checkouts and changes with an imported public asset',()=>{
 const roots=[mkdtempSync(join(tmpdir(),'mixx-version-a-')),mkdtempSync(join(tmpdir(),'mixx-version-b-'))];
 try{
  for(const root of roots){for(const path of ['apps/web/public','apps/web/screens','packages/domain/src'])mkdirSync(join(root,path),{recursive:true});writeFileSync(join(root,'apps/web/public/app.mjs'),'same entry');writeFileSync(join(root,'apps/web/public/billboards.css'),'original styling');writeFileSync(join(root,'apps/web/screens/index.html'),'same screen page');writeFileSync(join(root,'packages/domain/src/runtime.mjs'),'same domain');}
  const before=uiVersion(roots[0]);assert.match(before,/^[a-f0-9]{64}$/);assert.equal(before,uiVersion(roots[1]));
  writeFileSync(join(roots[0],'.env'),'private-not-a-public-asset');assert.equal(before,uiVersion(roots[0]));
  writeFileSync(join(roots[0],'apps/web/public/billboards.css'),'updated styling');assert.notEqual(before,uiVersion(roots[0]));
 }finally{for(const root of roots)rmSync(root,{recursive:true,force:true});}
});

test('dashboard embeds the public version; update checks are uncached and do not enter the TV player',async()=>{
 const app=createApplication({config:configuration({DB_PATH:':memory:',SIGNUPS_ENABLED:'false',APP_SECRET:'test-ui-version-not-a-live-secret-2026'})});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 try{
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const response=await fetch(base+'/api/ui-version'),payload=await response.json();assert.deepEqual(Object.keys(payload),['version']);assert.match(payload.version,/^[a-f0-9]{64}$/);assert.equal(response.headers.get('cache-control'),'no-store');
  const html=await (await fetch(base+'/')).text();assert.ok(html.includes(`name="mixxwave-ui-version" content="${payload.version}"`));assert.ok(html.includes('/ui-updates.mjs'));
  const player=await (await fetch(base+'/player/')).text();assert.ok(!player.includes('/ui-updates.mjs'));assert.ok(!player.includes('mixxwave-ui-version'));
  assert.equal((await fetch(base+'/api/ui-version',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,404);
 }finally{await app.close();}
});
