import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../apps/server/db.mjs';
import {screenActivityRoutes} from '../apps/server/routes/screen-activity.mjs';

test('brand filter choices exclude unrelated TV names inside an authorized venue',async()=>{
  const db=openDatabase(':memory:');
  try{
    db.run('INSERT INTO venues(id,name,type,timezone,mix,qr_code,referral_code,created_at) VALUES(?,?,?,?,?,?,?,?)','v','Venue','golf','UTC','{}','qr','ref',1);
    for(const [id,name] of [['own','Sponsored screen'],['private','Private office']])
      db.run('INSERT INTO tvs(id,venue_id,name,token_hash,created_at) VALUES(?,?,?,?,?)',id,'v',name,id,1);
    db.run('INSERT INTO content(id,title,worlds,duration,provider,asset_id,created_at) VALUES(?,?,?,?,?,?,?)','c','Film','["golf"]',30,'demo','sample',1);
    db.run('INSERT INTO campaigns VALUES(?,?,?,?,?,?,?,?,?)','campaign','brand-a','Campaign','c','golf','',1,100000,1);
    db.run('INSERT INTO manifests VALUES(?,?,?,?,?)','m','own','{}',100000,1);
    db.run('INSERT INTO events(id,tv_id,manifest_id,content_id,campaign_id,playback_id,kind,seconds,occurred_at,received_at) VALUES(?,?,?,?,?,?,?,?,?,?)','e','own','m','c','campaign','p','tick',5,1,1);
    let result;
    await screenActivityRoutes({path:'/api/screen-activity/options',method:'GET',url:new URL('https://example.test/api/screen-activity/options?scope=brand&venueId=v'),req:{},res:{},db,
      requireSession:()=>({id:'brand-user',platform_role:'brand',brand_id:'brand-a'}),rateLimit:()=>{},json:(_r,status,payload)=>{assert.equal(status,200);result=payload;}});
    assert.equal(result.venues.length,1);assert.deepEqual(result.tvs.map(t=>t.id),['own']);assert.ok(!JSON.stringify(result).includes('Private office'));
  }finally{db.close();}
});
