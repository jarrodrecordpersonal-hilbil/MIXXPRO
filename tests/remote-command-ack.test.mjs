import test from 'node:test';
import assert from 'node:assert/strict';
import {createApplication,configuration} from '../apps/server/app.mjs';
import {hash} from '../apps/server/security.mjs';

test('retrying an acknowledged remote command cannot downgrade its original result',async()=>{
  const app=createApplication({config:configuration({NODE_ENV:'test',DB_PATH:':memory:',DEMO_MODE:'true',SIGNUPS_ENABLED:'true',APP_ORIGIN:'http://127.0.0.1',APP_SECRET:'command-ack-idempotent-test-secret-2026'})});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  try{
    const signup=await fetch(base+'/api/auth/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Tester',venueName:'Stable Venue',email:'command-ack@example.test',password:'command-ack-test-password-2026',type:'other'})});
    assert.equal(signup.status,201);
    const cookie=signup.headers.get('set-cookie').split(';')[0];
    const session=await (await fetch(base+'/api/session',{headers:{Cookie:cookie}})).json();
    const venueId=session.venues[0].id,token='remote-ack-retry-device-token';
    const headers={Cookie:cookie,'Content-Type':'application/json','X-Venue-Id':venueId,'X-CSRF-Token':session.csrf};
    app.db.run('INSERT INTO tvs(id,venue_id,name,group_name,token_hash,last_seen,created_at) VALUES(?,?,?,?,?,?,?)','tv-retry',venueId,'Retry TV','',hash(token),Date.now(),Date.now());
    const issue=async(body)=>{
      const res=await fetch(base+'/api/commands',{method:'POST',headers,body:JSON.stringify({...body,ids:['tv-retry']})});
      assert.equal(res.status,200);
      return (await res.json()).commands[0].id;
    };
    const ack=async(commandId,status,detail)=>{
      const res=await fetch(base+'/api/player/ack',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({id:commandId,status,detail})});
      assert.equal(res.status,200);
      return (await res.json()).status;
    };
    const state=async(commandId)=>{
      const res=await fetch(base+'/api/commands/status?ids='+commandId,{headers:{Cookie:cookie,'X-Venue-Id':venueId}});
      assert.equal(res.status,200);
      return (await res.json()).commands[0];
    };
    const first=await issue({kind:'volume',volume:42});
    assert.equal(await ack(first,'applied','Player Volume 42%'),'applied');
    assert.equal(await ack(first,'blocked','stale following reconnect'),'applied');
    assert.equal((await state(first)).status,'applied');
    assert.equal((await state(first)).detail,'Player Volume 42%');

    const second=await issue({kind:'mute',muted:false});
    assert.equal(await ack(second,'blocked','Browser denied audio'),'blocked');
    assert.equal(await ack(second,'applied','duplicate retry'),'blocked');
    assert.equal((await state(second)).status,'blocked');
    assert.equal((await state(second)).detail,'Browser denied audio');
  }finally{await app.close();}
});
