/** Venue API routes. Authorization remains inside every scoped operation. */
export async function venueRoutes(context){
  const {req,res,path,method,url,ip,b,raw,db,config,json,audit,transaction,readSession,requireSession,access,admin,device,getVenue,schedulesFor,tvRows,issueSession,createVenue,enqueue,summarize,effective,manifest,billing,id,now,types,DEFAULT_MIX,parse,escape,token,hash,mac,equal,passwordHash,verifyPassword,verifyHook,rateLimit,fail,text,integer,choice,mixDefinition,WORLDS,THEMES,hardwareEligible,commission,bunnyUrl,bunnyList,bunnyVideo,r2UploadUrl,destinationUrl,qrSvg}=context;
      const validateBlock=definition=>{
        if(!definition||typeof definition!=='object'||Array.isArray(definition))fail(400,'Workshop block definition is required.');
        if(!Array.isArray(definition.segments)||!definition.segments.length||definition.segments.length>24)fail(400,'Use between 1 and 24 Workshop segments.');
        const segments=definition.segments.map((s,index)=>{
          if(!s||typeof s!=='object'||Array.isArray(s))fail(400,`Segment ${index+1} is invalid.`);
          const world=choice(s.world,WORLDS.map(w=>w.id),`segment ${index+1} world`),minutes=integer(s.minutes,`segment ${index+1} minutes`,5,180);
          return {world,minutes};
        });
        return {segments};
      };
      const blockOut=row=>({...row,definition:parse(row.definition,{segments:[]})});
      if(method==='GET'&&path==='/api/catalog'){
        const {venue}=access(req);
        const rows=db.all("SELECT id,title,worlds,tags,duration,provider,asset_id,resolution,clean,premium_only,sponsor FROM content WHERE status='published' AND ready=1 AND rights_confirmed=1 AND (rights_until IS NULL OR rights_until>?) ORDER BY created_at DESC",now());
        const content=rows.filter(c=>!(venue.plan!=='premium'&&c.premium_only)).map(c=>({id:c.id,title:c.title,worlds:parse(c.worlds,[]),tags:parse(c.tags,[]),duration:c.duration,provider:c.provider,resolution:c.resolution,clean:!!c.clean,premiumOnly:!!c.premium_only,sponsor:!!c.sponsor}));
        return json(res,200,{content,worlds:WORLDS.map(w=>({id:w.id,name:w.name,description:w.description})),measurement:'Catalog availability only. Playback is controlled through the venue MIXX and TV remote.'});
      }
      if(method==='GET'&&path==='/api/workshop/blocks'){
        const {venue}=access(req);
        const blocks=db.all('SELECT * FROM workshop_blocks WHERE venue_id=? ORDER BY updated_at DESC,name',venue.id).map(blockOut);
        const templates=[
          {id:'template-bourbon-hour',name:'Bourbon Hour',description:'A focused 30-minute bourbon block.',definition:{segments:[{world:'bourbon',minutes:30}]}},
          {id:'template-cocktail-break',name:'Cocktail Break',description:'A short cocktail reset between longer programming.',definition:{segments:[{world:'cocktails',minutes:10}]}},
          {id:'template-night-out',name:'Night Out',description:'Food, cocktails and bourbon for an evening room.',definition:{segments:[{world:'food',minutes:20},{world:'cocktails',minutes:15},{world:'bourbon',minutes:25}]}},
          {id:'template-weekend',name:'Weekend Mix',description:'Golf, outdoors and bourbon in one easy block.',definition:{segments:[{world:'golf',minutes:25},{world:'outdoors',minutes:20},{world:'bourbon',minutes:25}]}}
        ];
        return json(res,200,{blocks,templates,worlds:WORLDS.map(w=>({id:w.id,name:w.name}))});
      }
      if(method==='POST'&&path==='/api/workshop/blocks'){
        const {venue,user}=access(req,true),definition=validateBlock(b.definition),blockId=id(),created=now();
        const name=text(b.name,'Block name',80),description=b.description?text(b.description,'Block description',240):'';
        db.run('INSERT INTO workshop_blocks(id,venue_id,name,description,definition,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',blockId,venue.id,name,description,JSON.stringify(definition),created,created);
        audit(user.id,venue.id,'workshop.block.created',{blockId});return json(res,201,{block:blockOut(db.get('SELECT * FROM workshop_blocks WHERE id=?',blockId))});
      }
      if(method==='PATCH'&&/^\/api\/workshop\/blocks\/[^/]+$/.test(path)){
        const {venue,user}=access(req,true),blockId=path.split('/').at(-1),existing=db.get('SELECT * FROM workshop_blocks WHERE id=? AND venue_id=?',blockId,venue.id);if(!existing)fail(404,'Workshop block not found.');
        const definition=b.definition===undefined?parse(existing.definition):validateBlock(b.definition),name=b.name===undefined?existing.name:text(b.name,'Block name',80),description=b.description===undefined?existing.description:(b.description?text(b.description,'Block description',240):'');
        db.run('UPDATE workshop_blocks SET name=?,description=?,definition=?,updated_at=? WHERE id=? AND venue_id=?',name,description,JSON.stringify(definition),now(),blockId,venue.id);audit(user.id,venue.id,'workshop.block.updated',{blockId});return json(res,200,{block:blockOut(db.get('SELECT * FROM workshop_blocks WHERE id=?',blockId))});
      }
      if(method==='DELETE'&&/^\/api\/workshop\/blocks\/[^/]+$/.test(path)){
        const {venue,user}=access(req,true),blockId=path.split('/').at(-1),existing=db.get('SELECT id FROM workshop_blocks WHERE id=? AND venue_id=?',blockId,venue.id);if(!existing)fail(404,'Workshop block not found.');
        db.run('DELETE FROM workshop_blocks WHERE id=? AND venue_id=?',blockId,venue.id);audit(user.id,venue.id,'workshop.block.deleted',{blockId});return json(res,200,{ok:true});
      }
      if(method==='POST'&&path==='/api/schedules'){
        const {venue,user}=access(req,true);const mix=mixDefinition(b.mix),theme=choice(b.theme,THEMES.map(t=>t.id),'theme');
        const name=text(b.name,'Schedule name',80);const time=v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
        if(!time(b.start)||!time(b.end)||b.start===b.end)fail(400,'Choose different valid start and end times.');
        if(!Array.isArray(b.days)||!b.days.length||b.days.some(d=>!Number.isInteger(d)||d<0||d>6))fail(400,'Choose at least one day.');
        const ids=b.tvIds||[];if(!Array.isArray(ids)||ids.some(t=>!tvRows(venue.id).some(x=>x.id===t)))fail(400,'Select TVs from this venue.');
        db.run('INSERT INTO schedules VALUES(?,?,?,?,?,?,?,?,?,?,?)',id(),venue.id,name,JSON.stringify([...new Set(b.days)]),JSON.stringify(ids),b.start,b.end,JSON.stringify(mix),theme,1,now());audit(user.id,venue.id,'schedule.created');return json(res,201,{ok:true});
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
        const {venue}=access(req,true);db.run('UPDATE promotions SET active=0 WHERE id=? AND venue_id=?',path.split('/').at(-1),venue.id);return json(res,200,{ok:true});
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
