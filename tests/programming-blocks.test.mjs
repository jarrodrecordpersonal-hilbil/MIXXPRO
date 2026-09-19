import test from 'node:test';
import assert from 'node:assert/strict';
import {createApplication,configuration} from '../apps/server/app.mjs';
import {hash} from '../apps/server/security.mjs';

test('venue builds a saved three-hour block and player manifest uses it',async()=>{
  const config=configuration({NODE_ENV:'test',DB_PATH:':memory:',DEMO_MODE:'true',SIGNUPS_ENABLED:'true',APP_ORIGIN:'http://127.0.0.1',APP_SECRET:'programming-block-test-secret-1234567890'});
  const app=createApplication({config});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const port=app.server.address().port,base=`http://127.0.0.1:${port}`;
  try{
    const signup=await fetch(base+'/api/auth/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Jordan',venueName:'Block Test',email:'block@example.test',password:'programming-block-password',type:'golf',timezone:'America/Chicago'})});
    assert.equal(signup.status,201);
    const cookie=signup.headers.get('set-cookie').split(';')[0];
    const sessionResponse=await fetch(base+'/api/session',{headers:{Cookie:cookie}});
    const session=await sessionResponse.json(),venueId=session.venues[0].id;
    const headers={Cookie:cookie,'X-Venue-Id':venueId,'X-CSRF-Token':session.csrf,'Content-Type':'application/json'};
    const created=Date.now();
    for(const [id,title,duration] of [['a','Golf Story A',600],['b','Golf Story B',900],['c','Golf Story C',1200]]){
      app.db.run('INSERT INTO content(id,title,worlds,tags,duration,provider,asset_id,resolution,status,ready,clean,premium_only,sponsor,rights_confirmed,rights_until,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,title,JSON.stringify(['golf']),JSON.stringify(['Courses']),duration,'demo',id,720,'published',1,1,0,0,1,null,created);
    }
    const mix={mode:'single',worlds:{golf:'normal'},subcategories:{},minutes:180,seed:7};
    const builtResponse=await fetch(base+'/api/programming-blocks',{method:'POST',headers,body:JSON.stringify({mix})});
    const built=await builtResponse.json();
    assert.equal(builtResponse.status,201,JSON.stringify(built));
    assert.equal(built.block.durationSeconds,10800);
    assert.equal(built.block.targetSeconds,10800);
    assert.ok(built.block.itemCount>3);

    const currentResponse=await fetch(base+'/api/programming-blocks/current',{headers:{Cookie:cookie,'X-Venue-Id':venueId}});
    assert.equal(currentResponse.status,200);
    const current=await currentResponse.json();
    assert.equal(current.block.id,built.block.id);

    const deviceToken='block-device-token';
    app.db.run('INSERT INTO tvs(id,venue_id,name,group_name,token_hash,mix,created_at) VALUES(?,?,?,?,?,?,?)','tv-block',venueId,'Main TV','',hash(deviceToken),JSON.stringify({...mix,minutes:180}),created);
    const manifestResponse=await fetch(base+'/api/player/manifest',{headers:{Authorization:'Bearer '+deviceToken}});
    const manifest=await manifestResponse.json();
    assert.equal(manifestResponse.status,200,JSON.stringify(manifest));
    assert.equal(manifest.programmingBlockId,built.block.id);
    assert.equal(manifest.items.reduce((sum,item)=>sum+item.playSeconds,0),10800);
    assert.ok(manifest.items.every(item=>item.campaignId===null&&item.venueCreativeId===undefined));
  }finally{
    await app.close();
  }
});
