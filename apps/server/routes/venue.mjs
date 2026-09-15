/** Venue API routes. Authorization remains inside every scoped operation. */
export async function venueRoutes(context){
  const {req,res,path,method,url,ip,b,raw,db,config,json,audit,transaction,readSession,requireSession,access,admin,device,getVenue,schedulesFor,tvRows,issueSession,createVenue,enqueue,summarize,effective,manifest,billing,id,now,types,DEFAULT_MIX,parse,escape,token,hash,mac,equal,passwordHash,verifyPassword,verifyHook,rateLimit,fail,text,integer,choice,mixDefinition,WORLDS,THEMES,hardwareEligible,commission,bunnyUrl,bunnyList,bunnyVideo,r2UploadUrl,destinationUrl,qrSvg}=context;
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
