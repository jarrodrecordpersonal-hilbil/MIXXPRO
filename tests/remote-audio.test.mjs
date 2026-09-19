import test from 'node:test';
import assert from 'node:assert/strict';
import {createApplication,configuration} from '../apps/server/app.mjs';
import {hash} from '../apps/server/security.mjs';

async function signup(base,email,venueName){
  const response=await fetch(base+'/api/auth/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Owner',venueName,email,password:'remote-audio-password-2026',type:'other',timezone:'America/Chicago'})});
  assert.equal(response.status,201);
  const cookie=response.headers.get('set-cookie').split(';')[0];
  const session=await (await fetch(base+'/api/session',{headers:{Cookie:cookie}})).json();
  return {cookie,session,venueId:session.venues[0].id,headers:{Cookie:cookie,'Content-Type':'application/json','X-Venue-Id':session.venues[0].id,'X-CSRF-Token':session.csrf}};
}

test('remote audio commands are venue-scoped and report pending applied blocked and offline truthfully',async()=>{
  const config=configuration({NODE_ENV:'test',DB_PATH:':memory:',DEMO_MODE:'true',SIGNUPS_ENABLED:'true',APP_ORIGIN:'http://127.0.0.1',APP_SECRET:'remote-audio-test-secret-123456789012345'});
  const app=createApplication({config});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  try{
    const a=await signup(base,'audio-a@example.test','Audio A');
    const b=await signup(base,'audio-b@example.test','Audio B');
    const now=Date.now(),tokenA='device-a-token',tokenB='device-b-token';
    app.db.run('INSERT INTO tvs(id,venue_id,name,group_name,token_hash,last_seen,created_at) VALUES(?,?,?,?,?,?,?)','tv-a',a.venueId,'Main Bar','Bar TVs',hash(tokenA),now,now);
    app.db.run('INSERT INTO tvs(id,venue_id,name,group_name,token_hash,last_seen,created_at) VALUES(?,?,?,?,?,?,?)','tv-b',b.venueId,'Other Venue','',hash(tokenB),now,now);

    let response=await fetch(base+'/api/commands',{method:'POST',headers:a.headers,body:JSON.stringify({kind:'volume',ids:['tv-a'],volume:42})});
    let body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.commands[0].status,'pending');const volumeId=body.commands[0].id;
    response=await fetch(base+'/api/commands/status?ids='+volumeId,{headers:{Cookie:a.cookie,'X-Venue-Id':a.venueId}});body=await response.json();assert.equal(body.commands[0].status,'pending');

    response=await fetch(base+'/api/player/ack',{method:'POST',headers:{Authorization:'Bearer '+tokenA,'Content-Type':'application/json'},body:JSON.stringify({id:volumeId,status:'applied',detail:'Player Volume 42%'})});
    assert.equal(response.status,200);
    body=await (await fetch(base+'/api/commands/status?ids='+volumeId,{headers:{Cookie:a.cookie,'X-Venue-Id':a.venueId}})).json();assert.equal(body.commands[0].status,'applied');assert.match(body.commands[0].detail,/42%/);

    response=await fetch(base+'/api/commands',{method:'POST',headers:a.headers,body:JSON.stringify({kind:'mute',ids:['tv-a'],muted:false})});body=await response.json();const muteId=body.commands[0].id;
    await fetch(base+'/api/player/ack',{method:'POST',headers:{Authorization:'Bearer '+tokenA,'Content-Type':'application/json'},body:JSON.stringify({id:muteId,status:'blocked',detail:'Browser requires a tap on the player to enable sound'})});
    body=await (await fetch(base+'/api/commands/status?ids='+muteId,{headers:{Cookie:a.cookie,'X-Venue-Id':a.venueId}})).json();assert.equal(body.commands[0].status,'blocked');

    response=await fetch(base+'/api/commands',{method:'POST',headers:a.headers,body:JSON.stringify({kind:'volume',ids:['tv-b'],volume:10})});assert.equal(response.status,404);

    app.db.run('UPDATE tvs SET last_seen=NULL WHERE id=?','tv-a');
    response=await fetch(base+'/api/commands',{method:'POST',headers:a.headers,body:JSON.stringify({kind:'mute',ids:['tv-a'],muted:true})});body=await response.json();assert.equal(body.commands[0].status,'offline');
    const offlineId=body.commands[0].id;body=await (await fetch(base+'/api/commands/status?ids='+offlineId,{headers:{Cookie:a.cookie,'X-Venue-Id':a.venueId}})).json();assert.equal(body.commands[0].status,'offline');
  }finally{await app.close();}
});
