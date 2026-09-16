import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Google auth routes use state, exact callback and verified email checks',()=>{
  const auth=read('apps/server/routes/auth.mjs');
  assert.match(auth,/\/api\/auth\/google'/);
  assert.match(auth,/\/api\/auth\/google\/callback'/);
  assert.match(auth,/oauth2\.googleapis\.com\/token/);
  assert.match(auth,/oauth2\.googleapis\.com\/tokeninfo/);
  assert.match(auth,/email_verified!=='true'/);
  assert.match(auth,/profile\.aud!==process\.env\.GOOGLE_CLIENT_ID/);
  assert.match(auth,/mixx_google_state/);
  assert.match(auth,/signup\.google/);
});

test('public auth UI exposes Continue with Google only when configured',()=>{
  const polish=read('apps/web/public/polish.mjs');
  assert.match(polish,/Continue with Google/);
  assert.match(polish,/\/api\/auth\/google/);
  assert.match(polish,/googleReady/);
});

test('Render blueprint enables public signups and keeps Google credentials private',()=>{
  const blueprint=JSON.parse(read('render.yaml'));
  const vars=Object.fromEntries(blueprint.services[0].envVars.map(v=>[v.key,v]));
  assert.equal(vars.SIGNUPS_ENABLED.value,'true');
  assert.equal(vars.GOOGLE_CLIENT_ID.sync,false);
  assert.equal(vars.GOOGLE_CLIENT_SECRET.sync,false);
  assert.equal(vars.GOOGLE_CLIENT_SECRET.value,undefined);
});
