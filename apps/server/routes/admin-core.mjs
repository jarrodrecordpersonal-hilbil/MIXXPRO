/** Admin API routes. Authorization remains inside every scoped operation. */
export async function adminRoutes(context){
  const {req,res,path,method,url,ip,b,raw,db,config,json,audit,transaction,readSession,requireSession,access,admin,device,getVenue,schedulesFor,tvRows,issueSession,createVenue,enqueue,summarize,effective,manifest,billing,id,now,types,DEFAULT_MIX,parse,escape,token,hash,mac,equal,passwordHash,verifyPassword,verifyHook,rateLimit,fail,text,integer,choice,mixDefinition,WORLDS,THEMES,hardwareEligible,commission,bunnyUrl,bunnyList,bunnyVideo,r2UploadUrl,destinationUrl,qrSvg}=context;
      if(method==='GET'&&path==='/api/admin'){
        admin(req);return json(res,200,{content:db.all('SELECT * FROM content ORDER BY created_at DESC'),campaigns:db.all('SELECT * FROM campaigns'),contracts:db.all('SELECT c.*,v.name venue_name FROM contracts c JOIN venues v ON v.id=c.venue_id ORDER BY c.created_at DESC'),venues:db.all('SELECT id,name,plan FROM venues'),audit:db.all('SELECT * FROM audit ORDER BY created_at DESC LIMIT 40'),integrations:{bunny:!!(config.BUNNY_API_KEY&&config.BUNNY_CDN_HOST&&config.BUNNY_TOKEN_KEY),r2:!!config.R2_ACCESS_KEY_ID,stripe:!!config.STRIPE_SECRET_KEY,commerce:!!config.COMMERCE_WEBHOOK_SECRET},demo:config.DEMO_MODE});
      }
      if(method==='GET'&&path==='/api/admin/environments'){
        admin(req);return json(res,200,{environments:db.all('SELECT * FROM curated_environments ORDER BY updated_at DESC').map(x=>({...x,mix:parse(x.mix,DEFAULT_MIX),blockedBrands:parse(x.blocked_brands,[]),showQr:!!x.show_qr,showVenuePromotions:!!x.show_venue_promotions}))});
      }
      if(method==='POST'&&path==='/api/admin/environments'){
        const user=admin(req),mix=mixDefinition(b.mix),playbackMode=choice(b.playbackMode||'full',['full','no-ads','clean'],'playback mode'),clean=playbackMode==='clean',created=now(),environmentId=id();
        const blocked=Array.isArray(b.blockedBrands)?[...new Set(b.blockedBrands.map(x=>text(x,'Brand',80)))]:[];
        db.run('INSERT INTO curated_environments(id,name,description,mix,theme,accent,playback_mode,show_qr,show_venue_promotions,blocked_brands,status,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',environmentId,text(b.name,'Environment name',80),text(b.description||'','Description',240),JSON.stringify(mix),choice(b.theme||'modern-luxury',THEMES.map(t=>t.id),'theme'),text(b.accent||'#c7aa77','Accent',20),playbackMode,clean?0:(b.showQr===false?0:1),clean?0:(b.showVenuePromotions===false?0:1),JSON.stringify(blocked),'draft',1,created,created);
        audit(user.id,null,'environment.created',{environmentId});return json(res,201,{ok:true,id:environmentId,status:'draft'});
      }
      if(method==='POST'&&path.startsWith('/api/admin/environments/')&&path.endsWith('/publish')){
        const user=admin(req),environmentId=path.split('/')[4],environment=db.get('SELECT * FROM curated_environments WHERE id=?',environmentId);if(!environment)fail(404,'Environment not found.');
        db.run("UPDATE curated_environments SET status='published',version=version+1,updated_at=? WHERE id=?",now(),environmentId);audit(user.id,null,'environment.published',{environmentId,version:environment.version+1});return json(res,200,{ok:true,id:environmentId,status:'published',version:environment.version+1});
      }
      if(method==='POST'&&path.startsWith('/api/admin/environments/')&&path.endsWith('/withdraw')){
        const user=admin(req),environmentId=path.split('/')[4],environment=db.get('SELECT id FROM curated_environments WHERE id=?',environmentId);if(!environment)fail(404,'Environment not found.');
        db.run("UPDATE curated_environments SET status='withdrawn',updated_at=? WHERE id=?",now(),environmentId);audit(user.id,null,'environment.withdrawn',{environmentId});return json(res,200,{ok:true,id:environmentId,status:'withdrawn'});
      }
      if(method==='POST'&&path==='/api/admin/media/import'){
        const user=admin(req),page=integer(b.page??1,'Page',1,10000),response=await bunnyList(config,page);let added=0;
        transaction(()=>{for(const video of response.items||[]){if(db.get('SELECT id FROM content WHERE provider=\'bunny\' AND asset_id=?',video.guid))continue;db.run('INSERT INTO content(id,title,worlds,duration,provider,asset_id,ready,created_at) VALUES(?,?,?,?,?,?,?,?)',id(),String(video.title).slice(0,160),'[]',Math.max(1,Math.min(14400,Math.floor(video.length||1))),'bunny',video.guid,video.status===4?1:0,now());added++;}});audit(user.id,null,'media.import',{added});return json(res,200,{added,totalItems:response.totalItems,page});
      }
      if(method==='POST'&&path==='/api/admin/media/bulk'){
        const user=admin(req);if(!Array.isArray(b.ids)||!b.ids.length||b.ids.length>100)fail(400,'Select between 1 and 100 videos.');
        const ids=[...new Set(b.ids.map(v=>text(v,'Content ID',80)))],world=choice(b.world,WORLDS.map(w=>w.id),'content world'),resolution=choice(b.resolution??720,[360,480,720,1080],'MP4 resolution');
        if(b.rightsConfirmed!==true)fail(400,'Confirm that you own or control public-venue exhibition and local-cache rights for every selected video.');
        const results=[];
        for(const contentId of ids){
          const c=db.get('SELECT * FROM content WHERE id=?',contentId);if(!c){results.push({id:contentId,ok:false,error:'Content not found.'});continue;}
          try{
            let duration=c.duration,ready=c.ready;
            if(c.provider==='bunny'){
              const remote=await bunnyVideo(config,c.asset_id);if(remote.status!==4)throw Error('Encoding is not finished.');duration=Math.floor(remote.length||0);if(duration<1)throw Error('Video duration is unavailable.');
              const mediaUrl=bunnyUrl(c.asset_id,resolution,config,Math.floor(now()/1000)+600);let check;
              try{check=await fetch(mediaUrl,{method:'HEAD',signal:AbortSignal.timeout(15000)});}catch{throw Error('Could not verify the Bunny MP4.');}
              if(!check.ok)throw Error(`MP4 verification returned ${check.status}.`);ready=1;
            }else if(!config.DEMO_MODE)throw Error('Demo content is disabled.');
            db.run("UPDATE content SET worlds=?,status='published',resolution=?,clean=?,rights_confirmed=1,rights_until=NULL,duration=?,ready=? WHERE id=?",JSON.stringify([world]),resolution,b.clean===true?1:0,duration,ready,c.id);
            results.push({id:c.id,ok:true,title:c.title});
          }catch(error){results.push({id:c.id,ok:false,title:c.title,error:String(error.message||error).slice(0,160)});}
        }
        const published=results.filter(r=>r.ok).length,failed=results.length-published;audit(user.id,null,'media.bulk-published',{selected:results.length,published,failed,world,resolution});return json(res,200,{selected:results.length,published,failed,results});
      }
      if(method==='PATCH'&&/^\/api\/admin\/media\/[^/]+$/.test(path)){
        const user=admin(req),contentId=path.split('/').at(-1),c=db.get('SELECT * FROM content WHERE id=?',contentId);if(!c)fail(404,'Content not found.');
        if(!Array.isArray(b.worlds)||!b.worlds.length||b.worlds.some(w=>!WORLDS.some(x=>x.id===w)))fail(400,'Choose at least one content world.');
        const tags=Array.isArray(b.tags)?b.tags.map(t=>text(t,'Tag',60)):[];if(tags.length>30)fail(400,'Use no more than 30 tags.');
        const status=choice(b.status,['draft','published'],'publication status'),resolution=choice(b.resolution??720,[360,480,720,1080],'MP4 resolution');
        let duration=c.duration,ready=c.ready;
        if(status==='published'){
          if(b.rightsConfirmed!==true)fail(400,'Public-venue exhibition and local-cache rights must be confirmed.');
          if(c.provider==='bunny'){
            const remote=await bunnyVideo(config,c.asset_id);if(remote.status!==4)fail(409,'This video has not finished encoding.');duration=Math.floor(remote.length||0);if(duration<1)fail(409,'Video duration is not available.');
            const mediaUrl=bunnyUrl(c.asset_id,resolution,config,Math.floor(now()/1000)+600);
            let check;try{check=await fetch(mediaUrl,{method:'HEAD',signal:AbortSignal.timeout(15000)});}catch{fail(502,'Could not verify the MP4. Check Bunny configuration.');}
            if(!check.ok)fail(409,'That MP4 is not accessible. Enable MP4 Fallback and check the resolution and token key.');ready=1;
          }else if(!config.DEMO_MODE)fail(403,'Demo content is disabled.');
        }
        const rightsUntil=b.rightsUntil===null||b.rightsUntil===undefined?null:integer(b.rightsUntil,'Rights expiry',now()+1000,8640000000000000);
        db.run('UPDATE content SET title=?,worlds=?,tags=?,status=?,resolution=?,clean=?,premium_only=?,sponsor=?,rights_confirmed=?,rights_until=?,duration=?,ready=? WHERE id=?',text(b.title||c.title,'Title',160),JSON.stringify([...new Set(b.worlds)]),JSON.stringify(tags),status,resolution,b.clean===true?1:0,b.premiumOnly===true?1:0,b.sponsor===true?1:0,b.rightsConfirmed===true?1:0,rightsUntil,duration,ready,c.id);audit(user.id,null,'media.updated',{contentId,status});return json(res,200,{ok:true});
      }
      if(method==='POST'&&path==='/api/admin/archive-upload'){
        admin(req);const type=choice(b.contentType,['video/mp4','video/quicktime','image/png','image/jpeg','image/webp','text/vtt'],'file type');
        const filename=text(b.filename,'Filename',160).replace(/[^a-zA-Z0-9._-]/g,'_');return json(res,200,r2UploadUrl(`masters/${id()}/${filename}`,type,config));
      }
      if(method==='POST'&&path==='/api/admin/campaigns'){
        const user=admin(req),contentId=text(b.contentId,'Content',80);const c=db.get('SELECT * FROM content WHERE id=?',contentId);if(!c?.sponsor||c.status!=='published')fail(400,'Choose published sponsored content.');
        const start=integer(b.startsAt,'Start',0,8640000000000000),end=integer(b.endsAt,'End',now()+1000,8640000000000000);if(start>=end)fail(400,'End must follow start.');
        db.run('INSERT INTO campaigns VALUES(?,?,?,?,?,?,?,?,?)',id(),text(b.brandId,'Brand ID',80),text(b.name,'Campaign name',120),contentId,choice(b.world,WORLDS.map(w=>w.id),'world'),b.venueType?choice(b.venueType,types,'venue type'):'',start,end,b.active===true?1:0);audit(user.id,null,'campaign.created');return json(res,201,{ok:true});
      }
      if(method==='POST'&&path==='/api/admin/contracts/approve'){
        const user=admin(req),c=db.get('SELECT * FROM contracts WHERE id=?',text(b.id,'Request',80));if(!c)fail(404,'Request not found.');
        const ref=text(b.signedReference,'Signed agreement reference',200),expiry=integer(b.expiresAt,'Agreement expiry',now()+1,now()+c.years*366*86400000);
        db.run("UPDATE contracts SET status='approved',signed_ref=?,expires_at=? WHERE id=?",ref,expiry,c.id);audit(user.id,c.venue_id,'installation.approved',{id:c.id});return json(res,200,{eligible:hardwareEligible({...c,status:'approved',signed_ref:ref,expires_at:expiry})});
      }
      if(method==='POST'&&path==='/api/admin/payout-record'){
        const user=admin(req),venue=getVenue(text(b.venueId,'Venue',80)),reference=text(b.reference,'External payout reference',120);const amount=integer(b.amountCents,'Payout amount',1,100000000);
        transaction(()=>{const balance=summarize(venue.id).balanceCents;if(amount>balance)fail(409,'Payout exceeds the accrued balance.');db.run('INSERT INTO ledger VALUES(?,?,?,?,?,?,?,?)',id(),venue.id,null,'payout',-amount,'USD',`payout:${reference}`,now());});audit(user.id,venue.id,'payout.recorded',{reference,amount});return json(res,201,{ok:true,message:'External payout recorded. This application did not transfer funds.'});
      }
      if(method==='GET'&&path==='/api/brands'){
        const user=requireSession(req);if(!['admin','brand'].includes(user.platform_role))fail(403,'Brand access required.');
        const campaigns=user.platform_role==='admin'?db.all('SELECT * FROM campaigns'):db.all('SELECT * FROM campaigns WHERE brand_id=?',user.brand_id||'');
        return json(res,200,{campaigns:campaigns.map(c=>({...c,seconds:db.get('SELECT COALESCE(SUM(seconds),0) s FROM events WHERE campaign_id=?',c.id).s,scans:db.get('SELECT COUNT(*) n FROM scans WHERE campaign_id=?',c.id).n,salesCents:db.get('SELECT COALESCE(SUM(o.net_cents-o.refund_cents),0) s FROM orders o JOIN scans s ON s.id=o.scan_id WHERE s.campaign_id=?',c.id).s})),dwell:null,measurement:'Device-reported playback, not verified human views. Audience dwell is not measured.'});
      }
      if(method==='POST'&&path==='/api/admin/demo-content'){
        admin(req);if(!config.DEMO_MODE)fail(403,'Demo fixtures are disabled.');let added=0;
        for(const w of WORLDS)for(let n=1;n<=3;n++){const contentId=`demo-${w.id}-${n}`;if(db.get('SELECT id FROM content WHERE id=?',contentId))continue;db.run('INSERT INTO content(id,title,worlds,tags,duration,provider,asset_id,status,ready,clean,rights_confirmed,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',contentId,`${w.name} · Sample film ${n}`,JSON.stringify([w.id]),JSON.stringify([w.choices[n-1]]),6,'demo','sample','published',1,1,1,now());added++;}return json(res,201,{added});
      }
}
