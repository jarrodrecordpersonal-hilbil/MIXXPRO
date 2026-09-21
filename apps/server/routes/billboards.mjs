import {BILLBOARD_TEMPLATES,localTime,scheduleTime,destination,billboardView} from '../billboards.mjs';

export async function billboardRoutes(c){
 const {req,res,path,method,b,db,config,access,json,fail,text,id,token,now,transaction,audit,rateLimit,ip,qrSvg}=c;
 if(method==='GET'&&/^\/b\/[A-Za-z0-9_-]+$/.test(path)){
  rateLimit(db,'billboard-qr:'+ip,120,60000);
  const row=db.get('SELECT b.published_json FROM venue_billboards b JOIN promotions p ON p.id=b.promotion_id AND p.venue_id=b.venue_id WHERE b.qr_code=? AND p.active=1 AND p.starts_at<=? AND p.ends_at>?',path.split('/').at(-1),now(),now());
  if(!row)fail(404,'This venue promotion is no longer available.');
  const target=destination(JSON.parse(row.published_json).qrUrl,text);if(!target)fail(404,'This promotion has no destination.');
  res.writeHead(302,{Location:target,'Cache-Control':'no-store'});return res.end();
 }
 const match=/^\/api\/billboards(?:\/([a-f0-9-]{36})(?:\/(publish|withdraw))?)?$/.exec(path);if(!match)return;
 const {venue,user,role}=access(req,method!=='GET'),stamp=now();
 const groups=()=>[...new Set(c.tvRows(venue.id).map(t=>t.group_name).filter(Boolean))].sort();
 const view=row=>billboardView(db,row,venue.timezone,now());
 if(method==='GET'&&!match[1])return json(res,200,{canEdit:role!=='viewer',venueName:venue.name,timeZone:venue.timezone,groups:groups(),templates:BILLBOARD_TEMPLATES,defaults:{startsLocal:localTime(Math.ceil(stamp/60000)*60000,venue.timezone),endsLocal:localTime(Math.ceil(stamp/60000)*60000+7*86400000,venue.timezone)},legacyPromotions:db.all('SELECT p.* FROM promotions p LEFT JOIN venue_billboards b ON b.promotion_id=p.id WHERE p.venue_id=? AND p.active=1 AND b.id IS NULL ORDER BY p.created_at DESC',venue.id),billboards:db.all('SELECT * FROM venue_billboards WHERE venue_id=? ORDER BY updated_at DESC,id',venue.id).map(view)});
 if(method!=='POST'||!match[1])return;
 rateLimit(db,'billboard-write:'+user.id,60,60000);
 const billboardId=match[1];
 if(!Number.isInteger(b.expectedRevision)||b.expectedRevision<0)fail(400,'Refresh the billboard before saving.');
 const validateGroup=value=>{const group=text(value??'','TV group',40,true);if(group&&!groups().includes(group))fail(400,'Choose a current TV group from this venue.');return group;};
 const row=transaction(()=>{
  const existing=db.get('SELECT * FROM venue_billboards WHERE id=?',billboardId);
  if(existing&&existing.venue_id!==venue.id)fail(404,'Billboard not found.');
  if((existing?.revision||0)!==b.expectedRevision)fail(409,'This billboard changed. Refresh and review the current draft before trying again.');
  if(!match[2]){
   if(!existing&&db.get('SELECT COUNT(*) n FROM venue_billboards WHERE venue_id=?',venue.id).n>=100)fail(409,'This venue has reached its pilot limit of 100 billboards.');
   const title=text(b.title,'Headline',70),description=text(b.description,'Message',160),qrUrl=destination(b.qrUrl,text),templateId=text(b.templateId??'','Template',40,true),group=validateGroup(b.groupName);
   if(templateId&&!BILLBOARD_TEMPLATES.some(t=>t.id===templateId))fail(400,'Choose a MIXXWAVE template or create your own ad.');
   const start=scheduleTime(b.startsLocal,venue.timezone),end=scheduleTime(b.endsLocal,venue.timezone);if(end<=start)fail(400,'End time must follow start time.');
   if(existing)db.run('UPDATE venue_billboards SET title=?,description=?,qr_url=?,template_id=?,group_name=?,starts_at=?,ends_at=?,revision=revision+1,updated_at=? WHERE id=? AND venue_id=?',title,description,qrUrl,templateId,group,start,end,stamp,billboardId,venue.id);
   else db.run('INSERT INTO venue_billboards(id,venue_id,title,description,qr_url,template_id,group_name,starts_at,ends_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',billboardId,venue.id,title,description,qrUrl,templateId,group,start,end,stamp,stamp);
   audit(user.id,venue.id,'billboard.draft_saved',{billboardId});
  }else{
   if(!existing)fail(404,'Billboard not found.');
   if(match[2]==='withdraw'){
    if(existing.promotion_id)db.run('UPDATE promotions SET active=0 WHERE id=? AND venue_id=?',existing.promotion_id,venue.id);
    db.run('UPDATE venue_billboards SET revision=revision+1,qr_code=NULL,updated_at=? WHERE id=?',stamp,billboardId);
    audit(user.id,venue.id,'billboard.withdrawn',{billboardId});
   }else{
    validateGroup(existing.group_name);if(existing.ends_at<=stamp)fail(400,'Choose a future end time before publishing.');
    const promotionId=existing.promotion_id||id(),qrCode=existing.qr_url?token(9):null,revision=existing.revision+1;
    if(qrCode){try{qrSvg(`${config.APP_ORIGIN}/b/${qrCode}`);}catch{fail(400,'The app address is too long for a billboard QR. Ask your administrator to configure a shorter address.');}}
    const published={title:existing.title,description:existing.description,qrUrl:existing.qr_url,groupName:existing.group_name,startsAt:existing.starts_at,endsAt:existing.ends_at};
    const kind=BILLBOARD_TEMPLATES.find(t=>t.id===existing.template_id)?.kind||'event';
    db.run('INSERT INTO promotions(id,venue_id,kind,title,description,starts_at,ends_at,active,created_at) VALUES(?,?,?,?,?,?,?,1,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,title=excluded.title,description=excluded.description,starts_at=excluded.starts_at,ends_at=excluded.ends_at,active=1',promotionId,venue.id,kind,existing.title,existing.description,existing.starts_at,existing.ends_at,stamp);
    db.run('UPDATE venue_billboards SET promotion_id=?,published_json=?,published_revision=?,published_at=?,qr_code=?,revision=?,updated_at=? WHERE id=?',promotionId,JSON.stringify(published),revision,stamp,qrCode,revision,stamp,billboardId);
    audit(user.id,venue.id,'billboard.published',{billboardId,revision,groupName:existing.group_name});
   }
  }
  return db.get('SELECT * FROM venue_billboards WHERE id=?',billboardId);
 });
 return json(res,b.expectedRevision===0?201:200,{billboard:view(row)});
}
