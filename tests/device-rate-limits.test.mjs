import test from 'node:test';
import assert from 'node:assert/strict';
import {createApplication,configuration} from '../apps/server/app.mjs';
import {hash} from '../apps/server/security.mjs';
import {limitApiRequest} from '../apps/server/api-rate-limits.mjs';

test('trusted-device endpoint routing uses a separate quota without trusting arbitrary bearer strings',()=>{
  const valid='X'.repeat(43),seen=[];
  const db={get:(_sql,digest)=>digest===hash(valid)?{id:'trusted-tv'}:undefined};
  const apply=(_db,key,max,windowMs)=>{seen.push({key,max,windowMs});};
  const ask=(path,authorization)=>limitApiRequest(db,{path,ip:'proxy-ip',authorization},apply);
  assert.equal(ask('/api/player/heartbeat','Bearer '+valid),'device');
  assert.equal(ask('/api/player/events','Bearer '+valid),'device');
  assert.equal(ask('/api/player/pair','Bearer '+valid),'peer');
  assert.equal(ask('/api/player/state','Bearer '+'Z'.repeat(43)),'peer');
  assert.equal(ask('/api/venue','Bearer '+valid),'peer');
  assert.deepEqual(seen.map(x=>x.key),[
    'device-api:trusted-tv','device-api:trusted-tv',
    'general:proxy-ip','general:proxy-ip','general:proxy-ip'
  ]);
  assert.equal(seen[0].max,300);
  assert.equal(seen[2].max,6000);
});

test('an authenticated TV still works if a shared reverse-proxy IP quota is full',async()=>{
  const app=createApplication({config:configuration({
    DB_PATH:':memory:',DEMO_MODE:'true',NODE_ENV:'test',SIGNUPS_ENABLED:'true',
    APP_ORIGIN:'http://127.0.0.1',APP_SECRET:'device-rate-isolation-test-secret-2026'
  })});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  try{
    const signup=await fetch(base+'/api/auth/signup',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:'Pilot Owner',venueName:'Pilot Venue',email:'rate-test@example.test',
        password:'rate-limit-test-password-2026',type:'other'})});
    assert.equal(signup.status,201);
    const cookie=signup.headers.get('set-cookie').split(';')[0];
    const session=await (await fetch(base+'/api/session',{headers:{Cookie:cookie}})).json();
    const venueId=session.venues[0].id;
    const a='trusted-rate-device-A-token-longer-than-32-characters';
    const b='trusted-rate-device-B-token-longer-than-32-characters';
    const now=Date.now();
    for(const [tvId,token] of [['tv-rate-a',a],['tv-rate-b',b]])
      app.db.run('INSERT INTO tvs(id,venue_id,name,group_name,token_hash,last_seen,created_at) VALUES(?,?,?,?,?,?,?)',
        tvId,venueId,tvId,'',hash(token),now,now);
    // Render's direct-peer IP may be the same for many independent TVs.
    app.db.run('INSERT INTO rate_limits(key,hits,expires_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET hits=excluded.hits,expires_at=excluded.expires_at',
      'general:127.0.0.1',6000,now+60000);
    const state=async token=>fetch(base+'/api/player/state',{headers:{Authorization:'Bearer '+token}});
    assert.equal((await state(a)).status,200);
    assert.equal((await state(b)).status,200);
    const ordinary=await fetch(base+'/api/health');
    assert.equal(ordinary.status,429);
    assert.equal((await state('Z'.repeat(43))).status,429);
    app.db.run('INSERT INTO rate_limits(key,hits,expires_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET hits=excluded.hits,expires_at=excluded.expires_at',
      'device-api:tv-rate-a',300,now+60000);
    assert.equal((await state(a)).status,429);
    assert.equal((await state(b)).status,200);
  }finally{await app.close();}
});
