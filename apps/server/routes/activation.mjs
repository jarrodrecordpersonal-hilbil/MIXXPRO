/** Additional setup surfaces. Approval records never execute payments or enable music streams. */
import {readFileSync} from 'node:fs';
import {checkBunny} from '../bunny-check.mjs';
export async function activationRoutes(c){
  const {req,res,path,method,b,db,json,admin,access,requireSession,rateLimit,config,fail,text,integer,choice,id,now,audit}=c;
  const files={'/activation.mjs':['../../web/public/activation.mjs','text/javascript'],'/activation.css':['../../web/public/activation.css','text/css']};
  if(method==='GET'&&files[path]){const [file,type]=files[path];res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-cache'});return res.end(readFileSync(new URL(file,import.meta.url)));}
  if(method==='GET'&&['/music','/setup'].includes(path)){
    const user=requireSession(req);if(path==='/setup'&&user.platform_role!=='admin')fail(403,'Administrator access required.');
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(readFileSync(new URL('../../web/public/activation.html',import.meta.url)));
  }
  if(method==='POST'&&path==='/api/admin/bunny-check'){
    const user=admin(req);rateLimit(db,`bunny-check:${user.id}`,6,60000);
    const result=await checkBunny(config,{resolution:choice(b.resolution??720,[360,480,720,1080],'resolution')});
    audit(user.id,null,'bunny.diagnostic',{readyForPlayerTest:result.readyForPlayerTest});return json(res,200,result);
  }
  if(method==='GET'&&path==='/api/music'){
    const {venue,role}=access(req);
    const requests=db.all('SELECT id,payer,zones,sponsor_name,status,provider,valid_until,created_at FROM music_requests WHERE venue_id=? ORDER BY created_at DESC LIMIT 50',venue.id);
    return json(res,200,{requests,role,musicLive:false,paymentTaken:false,platformFundingCommitted:false});
  }
  if(method==='POST'&&path==='/api/music'){
    const {venue,user,role}=access(req,true);if(role!=='owner')fail(403,'Only the venue owner can choose the music payer.');
    rateLimit(db,`music-request:${user.id}`,10,3600000);
    const payer=choice(b.payer,['venue','sponsor'],'music payer'),zones=integer(b.zones??1,'Music zones',1,20);
    if(b.confirm!==true)fail(400,'Confirm that a quote and payer approval are required before activation.');
    const sponsor=text(b.sponsorName??'','Sponsor name',100,true);
    const requestId=db.transaction(()=>{
      if(db.get("SELECT id FROM music_requests WHERE venue_id=? AND status IN ('requested','approved')",venue.id))fail(409,'Your music request is already open. Cancel it before submitting a replacement.');
      const requestId=id();db.run('INSERT INTO music_requests(id,venue_id,payer,zones,sponsor_name,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',requestId,venue.id,payer,zones,sponsor,now(),now());return requestId;
    });
    audit(user.id,venue.id,'music.requested',{payer,zones});return json(res,201,{id:requestId,status:'requested',musicLive:false,paymentTaken:false,platformFundingCommitted:false});
  }
  if(method==='POST'&&/^\/api\/music\/[^/]+\/cancel$/.test(path)){
    const {venue,user,role}=access(req,true);if(role!=='owner')fail(403,'Only the venue owner can cancel this request.');
    const row=db.get('SELECT id,status FROM music_requests WHERE id=? AND venue_id=?',path.split('/')[3],venue.id);if(!row)fail(404,'Music request not found.');
    db.run("UPDATE music_requests SET status='cancelled',updated_at=? WHERE id=?",now(),row.id);audit(user.id,venue.id,'music.request.cancelled');
    return json(res,200,{ok:true,message:'Setup request cancelled. This does not cancel any external provider subscription.'});
  }
  if(method==='GET'&&path==='/api/admin/music'){
    admin(req);return json(res,200,{requests:db.all('SELECT m.*,v.name venue_name FROM music_requests m JOIN venues v ON v.id=m.venue_id ORDER BY m.created_at DESC LIMIT 200')});
  }
  if(method==='POST'&&path==='/api/admin/music/review'){
    const user=admin(req),requestId=text(b.id,'Request ID',80),decision=choice(b.decision,['approve','decline'],'decision');
    db.transaction(()=>{
      const row=db.get('SELECT * FROM music_requests WHERE id=?',requestId);if(!row)fail(404,'Music request not found.');
      if(row.status!=='requested')fail(409,'Only pending requests may be reviewed.');
      if(decision==='decline')db.run("UPDATE music_requests SET status='declined',reviewed_by=?,updated_at=? WHERE id=?",user.id,now(),row.id);
      else{
        if(b.confirm!==true)fail(400,'Confirm that you checked the payer agreement and music-service authorization.');
        const provider=text(b.provider,'Licensed provider',100),funding=text(b.fundingReference,'Payer agreement / payment reference',200),license=text(b.licenseReference,'Music-service authorization reference',200);
        const sponsor=text(b.sponsorName??row.sponsor_name,'Sponsor name',100,row.payer!=='sponsor');
        const expires=integer(b.validUntil,'Review expiry',now()+1,now()+366*86400000);
        db.run("UPDATE music_requests SET status='approved',provider=?,funding_reference=?,license_reference=?,sponsor_name=?,valid_until=?,reviewed_by=?,updated_at=? WHERE id=?",provider,funding,license,sponsor,expires,user.id,now(),row.id);
      }
    });
    audit(user.id,null,'music.request.reviewed',{id:requestId,decision});return json(res,200,{ok:true,musicLive:false,paymentTaken:false,message:'Review saved. Provider account connection and playback qualification are separate steps.'});
  }
}
