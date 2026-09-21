/** Venue API routes. Authorization remains inside every scoped operation. */
export async function venueRoutes(context){
  const {req,res,path,method,url,ip,b,raw,db,config,json,audit,transaction,readSession,requireSession,access,admin,device,getVenue,schedulesFor,tvRows,issueSession,createVenue,enqueue,summarize,effective,manifest,billing,id,now,types,DEFAULT_MIX,parse,escape,token,hash,mac,equal,passwordHash,verifyPassword,verifyHook,rateLimit,fail,text,integer,choice,mixDefinition,WORLDS,THEMES,hardwareEligible,commission,bunnyUrl,bunnyList,bunnyVideo,r2UploadUrl,destinationUrl,qrSvg}=context;
      if(method==='GET'&&path==='/api/catalog'){
        const {venue}=access(req);
        const rows=db.all("SELECT id,title,worlds,tags,duration,provider,asset_id,resolution,clean,premium_only,sponsor FROM content WHERE status='published' AND ready=1 AND rights_confirmed=1 AND (rights_until IS NULL OR rights_until>?) ORDER BY created_at DESC",now());
        const content=rows.filter(c=>!(venue.plan!=='premium'&&c.premium_only)).map(c=>({id:c.id,title:c.title,worlds:parse(c.worlds,[]),tags:parse(c.tags,[]),duration:c.duration,provider:c.provider,resolution:c.resolution,clean:!!c.clean,premiumOnly:!!c.premium_only,sponsor:!!c.sponsor}));
        return json(res,200,{content,worlds:WORLDS.map(w=>({id:w.id,name:w.name,description:w.description})),measurement:'Catalog availability only. Playback is controlled through the venue MIXX and TV remote.'});
      }
      if(method==='GET'&&path==='/api/current-mix'){
        const {venue}=access(req);return json(res,200,{mix:venue.mix,theme:venue.theme,accent:venue.accent});
      }
      if(method==='GET'&&path==='/api/environments'){
        const {venue}=access(req);
        const environments=db.all("SELECT * FROM curated_environments WHERE status='published' ORDER BY updated_at DESC").map(x=>({id:x.id,name:x.name,description:x.description,mix:parse(x.mix,DEFAULT_MIX),theme:x.theme,accent:x.accent,playbackMode:x.playback_mode,showQr:!!x.show_qr,showVenuePromotions:!!x.show_venue_promotions,version:x.version}));
        const assignments=db.all("SELECT te.tv_id AS tvId,te.environment_id AS environmentId,ce.name,ce.version FROM tv_environments te LEFT JOIN curated_environments ce ON ce.id=te.environment_id WHERE te.tv_id IN (SELECT id FROM tvs WHERE venue_id=? AND revoked=0)",venue.id);
        return json(res,200,{environments,assignments});
      }
      if(method==='POST'&&path.startsWith('/api/tvs/')&&path.endsWith('/environment')){
        const {venue,user}=access(req,true),tvId=path.split('/')[3],tv=tvRows(venue.id).find(t=>t.id===tvId);if(!tv)fail(404,'TV not found.');
        if(b.environmentId===null){db.run('DELETE FROM tv_environments WHERE tv_id=?',tvId);audit(user.id,venue.id,'tv.environment.cleared',{tvId});return json(res,200,{ok:true});}
        const environment=db.get("SELECT id,name,version FROM curated_environments WHERE id=? AND status='published'",text(b.environmentId,'Environment',80));if(!environment)fail(404,'Published environment not found.');
        db.run('INSERT INTO tv_environments(tv_id,environment_id,updated_at) VALUES(?,?,?) ON CONFLICT(tv_id) DO UPDATE SET environment_id=excluded.environment_id,updated_at=excluded.updated_at',tvId,environment.id,now());
        audit(user.id,venue.id,'tv.environment.changed',{tvId,environmentId:environment.id,version:environment.version});return json(res,200,{ok:true,environment});
      }
      if(method==='GET'&&path==='/api/saved-mixxes'){
        const {venue}=access(req);const rows=db.all('SELECT * FROM saved_mixxes WHERE venue_id=? ORDER BY updated_at DESC',venue.id).map(x=>({...x,mix:parse(x.mix,DEFAULT_MIX),blockedBrands:parse(x.blocked_brands,[]),showQr:!!x.show_qr,showVenuePromotions:!!x.show_venue_promotions}));
        return json(res,200,{mixxes:rows});
      }
      if(method==='POST'&&path==='/api/saved-mixxes'){
        const {venue,user}=access(req,true),mix=mixDefinition(b.mix),playbackMode=choice(b.playbackMode||'full',['full','no-ads','clean'],'playback mode'),clean=playbackMode==='clean';
        const blocked=Array.isArray(b.blockedBrands)?[...new Set(b.blockedBrands.map(x=>text(x,'Brand',80)))]:[];
        const savedId=id(),created=now();db.run('INSERT INTO saved_mixxes(id,venue_id,name,mix,theme,accent,playback_mode,show_qr,show_venue_promotions,blocked_brands,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',savedId,venue.id,text(b.name,'MIXX name',80),JSON.stringify(mix),choice(b.theme||venue.theme,THEMES.map(t=>t.id),'theme'),text(b.accent||venue.accent,'Accent',20),playbackMode,clean?0:(b.showQr===false?0:1),clean?0:(b.showVenuePromotions===false?0:1),JSON.stringify(blocked),created,created);audit(user.id,venue.id,'saved_mixx.created',{savedId,playbackMode});return json(res,201,{ok:true,id:savedId});
      }
      if(method==='DELETE'&&/^\/api\/saved-mixxes\/[^/]+$/.test(path)){
        const {venue}=access(req,true),savedId=path.split('/').at(-1);db.run('DELETE FROM saved_mixxes WHERE id=? AND venue_id=?',savedId,venue.id);return json(res,200,{ok:true});
      }
      if(method==='POST'&&/^\/api\/tvs\/[^/]+\/profile$/.test(path)){
        const {venue,user}=access(req,true),tvId=path.split('/')[3],tv=tvRows(venue.id).find(t=>t.id===tvId);if(!tv)fail(404,'TV not found.');
        const saved=db.get('SELECT id FROM saved_mixxes WHERE id=? AND venue_id=?',text(b.savedMixxId,'Saved MIXX',80),venue.id);if(!saved)fail(404,'Saved MIXX not found.');
        transaction(()=>{db.run('INSERT INTO tv_profiles(tv_id,saved_mixx_id,updated_at) VALUES(?,?,?) ON CONFLICT(tv_id) DO UPDATE SET saved_mixx_id=excluded.saved_mixx_id,updated_at=excluded.updated_at',tvId,saved.id,now());db.run('DELETE FROM tv_environments WHERE tv_id=?',tvId);});audit(user.id,venue.id,'tv.profile.changed',{tvId,savedMixxId:saved.id});return json(res,200,{ok:true});
      }
      if(method==='GET'&&path==='/api/venue-creatives'){
        const {venue}=access(req);return json(res,200,{creatives:db.all('SELECT * FROM venue_creatives WHERE venue_id=? ORDER BY updated_at DESC',venue.id)});
      }
      if(method==='POST'&&path==='/api/venue-creatives/upload'){
        const {venue,user}=access(req,true),filename=text(b.filename,'File name',160),contentType=choice(b.contentType,['video/mp4','video/quicktime'],'video type'),created=now(),creativeId=id();
        const safe=filename.replace(/[^a-zA-Z0-9._-]/g,'_'),key=`venue-creatives/${venue.id}/${creativeId}/${safe}`,upload=r2UploadUrl(key,contentType,config);
        db.run('INSERT INTO venue_creatives(id,venue_id,title,kind,status,asset_url,starts_at,ends_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',creativeId,venue.id,text(b.title||filename,'Title',80),'video','processing',key,b.startsAt||null,b.endsAt||null,created,created);audit(user.id,venue.id,'creative.upload.started',{creativeId});
        return json(res,201,{ok:true,id:creativeId,upload});
      }
      if(method==='POST'&&/^\/api\/venue-creatives\/[^/]+\/ready$/.test(path)){
        const {venue,user}=access(req,true),creativeId=path.split('/')[3],creative=db.get('SELECT * FROM venue_creatives WHERE id=? AND venue_id=?',creativeId,venue.id);if(!creative)fail(404,'Creative not found.');
        const playbackUrl=text(b.playbackUrl,'Playback URL',2000);let parsedUrl;try{parsedUrl=new URL(playbackUrl);}catch{fail(400,'Provide a valid processed playback URL.');}if(parsedUrl.protocol!=='https:')fail(400,'Playback URL must use HTTPS.');
        db.run("UPDATE venue_creatives SET status='ready',asset_url=?,updated_at=? WHERE id=? AND venue_id=?",playbackUrl,now(),creativeId,venue.id);audit(user.id,venue.id,'creative.ready',{creativeId});return json(res,200,{ok:true});
      }
      if(method==='POST'&&path==='/api/venue-creatives/request'){
        const {venue,user}=access(req,true),created=now(),creativeId=id();db.run('INSERT INTO venue_creatives(id,venue_id,title,kind,status,starts_at,ends_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',creativeId,venue.id,text(b.title||'Venue promotion','Title',80),'template-request','draft',b.startsAt||null,b.endsAt||null,created,created);audit(user.id,venue.id,'creative.requested',{creativeId});return json(res,201,{ok:true,id:creativeId});
      }
      if((method==='POST'&&path==='/api/schedules')||(method==='PATCH'&&/^\/api\/schedules\/[^/]+$/.test(path))){
        const {venue,user}=access(req,true);
        const scheduleId=method==='PATCH'?path.split('/').at(-1):id();
        if(method==='PATCH'&&!db.get('SELECT id FROM schedules WHERE id=? AND venue_id=?',scheduleId,venue.id))fail(404,'Schedule not found.');
        const mix=mixDefinition(b.mix),theme=choice(b.theme,THEMES.map(t=>t.id),'theme');
        const name=text(b.name,'Schedule name',80);const time=v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
        if(!time(b.start)||!time(b.end)||b.start===b.end)fail(400,'Choose different valid start and end times.');
        if(!Array.isArray(b.days)||!b.days.length||b.days.some(d=>!Number.isInteger(d)||d<0||d>6))fail(400,'Choose at least one day.');
        const ids=b.tvIds||[];if(!Array.isArray(ids)||ids.some(t=>!tvRows(venue.id).some(x=>x.id===t)))fail(400,'Select TVs from this venue.');
        if(method==='PATCH'){
          db.run('UPDATE schedules SET name=?,days=?,tv_ids=?,start_time=?,end_time=?,mix=?,theme=? WHERE id=? AND venue_id=?',name,JSON.stringify([...new Set(b.days)]),JSON.stringify(ids),b.start,b.end,JSON.stringify(mix),theme,scheduleId,venue.id);
        }else{
          db.run('INSERT INTO schedules VALUES(?,?,?,?,?,?,?,?,?,?,?)',scheduleId,venue.id,name,JSON.stringify([...new Set(b.days)]),JSON.stringify(ids),b.start,b.end,JSON.stringify(mix),theme,1,now());
        }
        audit(user.id,venue.id,method==='PATCH'?'schedule.updated':'schedule.created',{scheduleId});return json(res,method==='PATCH'?200:201,{ok:true,id:scheduleId});
      }
      if(method==='DELETE'&&/^\/api\/schedules\/[^/]+$/.test(path)){
        const {venue}=access(req,true);db.run('DELETE FROM schedules WHERE id=? AND venue_id=?',path.split('/').at(-1),venue.id);return json(res,200,{ok:true});
      }
      if(method==='POST'&&path==='/api/promotions'){
        const {venue,user}=access(req,true);const kind=choice(b.kind,['barrel-pick','exclusive-label','event','referral'],'promotion');
        const start=integer(b.startsAt,'Start date',0,8640000000000000),end=integer(b.endsAt,'End date',now()+1000,8640000000000000);if(end<=start)fail(400,'End date must follow start date.');
        db.run('INSERT INTO promotions VALUES(?,?,?,?,?,?,?,?,?)',id(),venue.id,kind,text(b.title,'Title',80),text(b.description,'Description',200),start,end,1,now());audit(user.id,venue.id,'promotion.created',{kind});return json(res,201,{ok:true});
      }
      if(method==='DELETE'&&/^\/api\/promotions\/[^/]+$/.test(path)){
        const {venue}=access(req,true);if(db.get('SELECT id FROM venue_billboards WHERE promotion_id=? AND venue_id=?',path.split('/').at(-1),venue.id))fail(409,'Withdraw this promotion from My Billboard.');db.run('UPDATE promotions SET active=0 WHERE id=? AND venue_id=?',path.split('/').at(-1),venue.id);return json(res,200,{ok:true});
      }
      if(method==='GET'&&path==='/api/revenue'){
        const {venue}=access(req);return json(res,200,{metrics:summarize(venue.id),ledger:db.all('SELECT * FROM ledger WHERE venue_id=? ORDER BY created_at DESC LIMIT 200',venue.id),referrals:db.all('SELECT name,created_at FROM venues WHERE referred_by=?',venue.id),qrUrl:`${config.APP_ORIGIN}/r/${venue.qr_code}`,qrImage:`/qr/${venue.qr_code}.svg`,referralUrl:`${config.APP_ORIGIN}/?ref=${venue.referral_code}`,rateConfigured:config.COMMISSION_BPS>0});
      }
      if(method==='POST'&&path==='/api/contracts'){
        const {venue,user,role}=access(req,true);if(role!=='owner')fail(403,'Only the venue owner can request an agreement.');
        const years=integer(b.years,'Agreement length',5,10);if(![5,10].includes(years))fail(400,'Hardware and installation require a 5- or 10-year agreement.');
        if(db.get("SELECT id FROM contracts WHERE venue_id=? AND status='requested'",venue.id))fail(409,'Your installation request is already awaiting review.');
        db.run('INSERT INTO contracts(id,venue_id,years,tvs,created_at) VALUES(?,?,?,?,?)',id(),venue.id,years,integer(b.tvs,'TV count',1,100),now());audit(user.id,venue.id,'installation.requested',{years});return json(res,201,{ok:true,message:'Request saved. Hardware is not approved until your signed agreement is reviewed.'});
      }
}
