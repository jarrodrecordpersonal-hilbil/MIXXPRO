import test from 'node:test';
import assert from 'node:assert/strict';
import {createApplication,configuration} from '../apps/server/app.mjs';
import {hash} from '../apps/server/security.mjs';

async function signup(base,email,venueName){
  const response=await fetch(base+'/api/auth/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Owner',venueName,email,password:'phase-two-password-2026',type:'other',timezone:'America/Chicago'})});
  assert.equal(response.status,201);
  const cookie=response.headers.get('set-cookie').split(';')[0];
  const session=await (await fetch(base+'/api/session',{headers:{Cookie:cookie}})).json();
  return {cookie,session,venueId:session.venues[0].id,headers:{Cookie:cookie,'Content-Type':'application/json','X-Venue-Id':session.venues[0].id,'X-CSRF-Token':session.csrf}};
}

test('curated environments publish centrally and assign only to authorized venue TVs',async()=>{
  const config=configuration({NODE_ENV:'test',DB_PATH:':memory:',DEMO_MODE:'true',SIGNUPS_ENABLED:'true',APP_ORIGIN:'http://127.0.0.1',APP_SECRET:'phase-two-environment-test-secret-123456'});
  const app=createApplication({config});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  try{
    const a=await signup(base,'environment-a@example.test','Environment A');
    const b=await signup(base,'environment-b@example.test','Environment B');
    app.db.run("UPDATE users SET platform_role='admin' WHERE id=?",a.session.user.id);
    const now=Date.now(),tokenA='environment-device-a',tokenB='environment-device-b';
    app.db.run('INSERT INTO tvs(id,venue_id,name,group_name,token_hash,created_at) VALUES(?,?,?,?,?,?)','env-tv-a',a.venueId,'Main Bar','Bar TVs',hash(tokenA),now);
    app.db.run('INSERT INTO tvs(id,venue_id,name,group_name,token_hash,created_at) VALUES(?,?,?,?,?,?)','env-tv-b',b.venueId,'Other Venue','',hash(tokenB),now);
    app.db.run('INSERT INTO content(id,title,worlds,tags,duration,provider,asset_id,resolution,status,ready,clean,premium_only,sponsor,rights_confirmed,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)','env-film','Environment Film',JSON.stringify(['golf']),JSON.stringify([]),60,'demo','sample',720,'published',1,1,0,0,1,now);

    const mix={mode:'single',worlds:{golf:'normal'},subcategories:{},minutes:180,seed:9};
    let response=await fetch(base+'/api/admin/environments',{method:'POST',headers:a.headers,body:JSON.stringify({name:'Cigar Lounge Evening',description:'Long-form relaxed stories',mix,playbackMode:'clean',showQr:true,showVenuePromotions:true})});
    let body=await response.json();assert.equal(response.status,201,JSON.stringify(body));const environmentId=body.id;
    response=await fetch(base+'/api/environments',{headers:{Cookie:a.cookie,'X-Venue-Id':a.venueId}});body=await response.json();assert.equal(body.environments.length,0,'draft environment must not be venue-selectable');

    response=await fetch(base+'/api/admin/environments/'+environmentId+'/publish',{method:'POST',headers:a.headers,body:'{}'});body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.version,2);
    response=await fetch(base+'/api/environments',{headers:{Cookie:a.cookie,'X-Venue-Id':a.venueId}});body=await response.json();assert.equal(body.environments.length,1);assert.equal(body.environments[0].name,'Cigar Lounge Evening');assert.equal(body.environments[0].showQr,false);assert.equal(body.environments[0].showVenuePromotions,false);

    response=await fetch(base+'/api/tvs/env-tv-a/environment',{method:'POST',headers:a.headers,body:JSON.stringify({environmentId})});assert.equal(response.status,200);
    response=await fetch(base+'/api/tvs/env-tv-b/environment',{method:'POST',headers:a.headers,body:JSON.stringify({environmentId})});assert.equal(response.status,404,'cross-venue TV assignment must be rejected');

    response=await fetch(base+'/api/player/manifest',{headers:{Authorization:'Bearer '+tokenA}});body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.environmentId,environmentId);assert.equal(body.environmentName,'Cigar Lounge Evening');assert.equal(body.playbackMode,'clean');assert.equal(body.showQr,false);assert.equal(body.showVenuePromotions,false);

    response=await fetch(base+'/api/admin/environments/'+environmentId+'/withdraw',{method:'POST',headers:a.headers,body:'{}'});assert.equal(response.status,200);
    response=await fetch(base+'/api/environments',{headers:{Cookie:a.cookie,'X-Venue-Id':a.venueId}});body=await response.json();assert.equal(body.environments.length,0,'withdrawn environment must disappear from venue choices');
    response=await fetch(base+'/api/player/manifest',{headers:{Authorization:'Bearer '+tokenA}});body=await response.json();assert.equal(body.environmentId,null,'withdrawn environment must fall back to existing venue/profile behavior');
  }finally{await app.close();}
});
