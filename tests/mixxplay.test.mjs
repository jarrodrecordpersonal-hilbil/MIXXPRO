import test from 'node:test';
import assert from 'node:assert/strict';
import {createApplication,configuration} from '../apps/server/app.mjs';

test('MIXXPLAY entrance and Whiskey Draft demo share the existing live-game engine',async t=>{
  const app=createApplication({config:configuration({NODE_ENV:'test',DB_PATH:':memory:',DEMO_MODE:'true',SIGNUPS_ENABLED:'true',APP_ORIGIN:'http://127.0.0.1',APP_SECRET:'mixxplay-whiskey-draft-test-secret-2026'})});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(()=>app.close());
  const base='http://127.0.0.1:'+app.server.address().port;
  const page=await fetch(base+'/play');
  assert.equal(page.status,200);
  const html=await page.text();
  assert.match(html,/The room<br>is the game/);
  assert.match(html,/Whiskey Draft/);

  const request=async(path,body,headers={})=>{
    const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  };
  const signup=await request('/api/auth/signup',{name:'Draft Host',venueName:'Draft House',email:'draft@example.test',password:'whiskey-draft-password-2026',type:'other'});
  assert.equal(signup.status,201);
  const session=(await request('/api/session',undefined,{Cookie:signup.cookie})).body;
  app.db.run("UPDATE users SET platform_role='admin' WHERE id=?",session.user.id);
  const headers={Cookie:signup.cookie,'X-Venue-Id':session.venues[0].id,'X-CSRF-Token':session.csrf};
  const created=await request('/api/admin/games/whiskey-draft-demo',{},headers);
  assert.equal(created.status,201);
  assert.equal(created.body.code,'DRAFT26');

  const state=await request('/api/public/games/DRAFT26');
  assert.equal(state.status,200);
  assert.equal(state.body.event.name,'Whiskey Draft · Opening Night');
  assert.equal(state.body.event.entries.length,4);
  const joined=await request('/api/public/games/DRAFT26/join',{name:'Home Taylor',locationKind:'home'});
  assert.equal(joined.status,200);
  assert.equal(joined.body.participant.name,'Home Taylor');
  assert.equal(app.db.get('SELECT location_kind FROM game_participation WHERE participant_id=?',joined.body.participant.id).location_kind,'home');

  const reopened=await request('/api/admin/games/whiskey-draft-demo',{},headers);
  assert.equal(reopened.status,200);
  assert.equal(reopened.body.id,created.body.id);
});
