import {scoreRows,teamRows,teamRules} from '../game-standings.mjs';
import {ingestPlaybackEvents} from '../playback-events.mjs';
/** Player API routes. Authorization remains inside every scoped operation. */
export async function playerRoutes(context){
  const {req,res,path,method,url,ip,b,raw,db,config,json,audit,transaction,readSession,requireSession,access,admin,device,getVenue,schedulesFor,tvRows,issueSession,createVenue,enqueue,summarize,effective,manifest,billing,id,now,types,DEFAULT_MIX,parse,escape,token,hash,mac,equal,passwordHash,verifyPassword,verifyHook,rateLimit,fail,text,integer,choice,mixDefinition,WORLDS,THEMES,hardwareEligible,commission,bunnyUrl,bunnyList,bunnyVideo,r2UploadUrl,destinationUrl,qrSvg}=context;
      if(method==='POST'&&path==='/api/player/pair'){
        rateLimit(db,`pair-create:${ip}`,20,3600000);const pairing=id(),poll=token(32),credential=token(32);
        let code;do{code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,'0');}while(db.get('SELECT id FROM pairings WHERE code=?',code));
        db.run('DELETE FROM pairings WHERE expires_at<? AND claimed_at IS NULL',now());
        db.run('INSERT INTO pairings(id,code,poll_hash,device_token_hash,expires_at) VALUES(?,?,?,?,?)',pairing,code,hash(poll),hash(credential),now()+600000);
        return json(res,201,{id:pairing,code,pollToken:poll,deviceToken:credential,expiresAt:now()+600000});
      }
      if(method==='GET'&&path.startsWith('/api/player/pair/')){
        const p=db.get('SELECT * FROM pairings WHERE id=?',path.split('/').at(-1));
        if(!p||!equal(p.poll_hash,hash(req.headers.authorization?.replace(/^Bearer /,'')||'')))fail(401,'Invalid pairing request.');
        if(!p.claimed_at&&p.expires_at<now())fail(410,'Pairing code expired.');return json(res,200,{status:p.claimed_at?'paired':'pending',tvId:p.tv_id});
      }
      if(method==='POST'&&path==='/api/tvs/claim'){
        const {user,venue}=access(req,true);rateLimit(db,`claim:${user.id}`,20,900000);
        const code=text(b.code,'Pairing code',6),name=text(b.name,'TV name',60),group=text(b.group||'','Group',40,true);
        const tvId=transaction(()=>{
          const p=db.get('SELECT * FROM pairings WHERE code=? AND claimed_at IS NULL AND expires_at>?',code,now());if(!p)fail(400,'That code is invalid, expired, or already used.');
          if(tvRows(venue.id).length>=(venue.plan==='free'?config.FREE_TV_LIMIT:venue.seats))fail(409,'Your plan has no available TV seats. Update your subscription first.');
          const tvId=id();db.run('INSERT INTO tvs(id,venue_id,name,group_name,token_hash,created_at) VALUES(?,?,?,?,?,?)',tvId,venue.id,name,group,p.device_token_hash,now());
          db.run('UPDATE pairings SET tv_id=?,claimed_at=? WHERE id=? AND claimed_at IS NULL',tvId,now(),p.id);return tvId;
        });audit(user.id,venue.id,'tv.paired',{tvId});return json(res,201,{tvId});
      }
      if(method==='PATCH'&&/^\/api\/tvs\/[^/]+$/.test(path)){
        const {venue,user}=access(req,true),tvId=path.split('/').at(-1);const tv=db.get('SELECT * FROM tvs WHERE id=? AND venue_id=? AND revoked=0',tvId,venue.id);if(!tv)fail(404,'TV not found.');
        if(b.revoke===true){db.run('UPDATE tvs SET revoked=1 WHERE id=?',tvId);audit(user.id,venue.id,'tv.revoked',{tvId});}
        else db.run('UPDATE tvs SET name=?,group_name=? WHERE id=?',text(b.name||tv.name,'TV name',60),text(b.group??tv.group_name,'Group',40,true),tvId);return json(res,200,{ok:true});
      }
      if(method==='POST'&&path==='/api/commands'){
        const {user,venue}=access(req,true),kind=choice(b.kind,['play','pause','next','shuffle','apply','volume','mute'],'command');
        const all=tvRows(venue.id);const ids=b.ids==='all'?all.map(t=>t.id):b.ids;
        if(!Array.isArray(ids)||!ids.length||ids.length>100)fail(400,'Select at least one TV.');
        const selected=[...new Set(ids)];if(selected.some(t=>!all.some(x=>x.id===t)))fail(404,'One of those TVs does not belong to this venue.');
        const mix=b.mix?mixDefinition(b.mix):null,theme=b.theme?choice(b.theme,THEMES.map(t=>t.id),'theme'):null;
        if(kind==='apply'&&!mix&&!theme)fail(400,'Choose a MIXX or theme first.');
        let payload={};if(kind==='volume')payload={volume:integer(b.volume,'Player volume',0,100)};if(kind==='mute'){if(typeof b.muted!=='boolean')fail(400,'Choose mute or unmute.');payload={muted:b.muted};}
        const commands=[];transaction(()=>{for(const tvId of selected){const tv=all.find(t=>t.id===tvId);if(kind==='shuffle'){db.run('UPDATE tvs SET rotation_seed=? WHERE id=?',crypto.getRandomValues(new Uint32Array(1))[0]%2147483647,tvId);}
          if(kind==='apply')db.run('UPDATE tvs SET mix=?,theme=? WHERE id=?',mix?JSON.stringify(mix):(tv.mix?JSON.stringify(tv.mix):null),theme||tv.theme,tvId);
          const created=now(),result=db.run('INSERT INTO commands(tv_id,kind,payload,created_at,expires_at) VALUES(?,?,?,?,?)',tvId,kind,JSON.stringify(payload),created,created+300000);
          commands.push({id:Number(result.lastInsertRowid),tvId,status:tv.online?'pending':'offline'});
        }});audit(user.id,venue.id,'command.queued',{kind,count:selected.length});return json(res,200,{queued:selected.length,commands,message:'Queued. Status changes only after the TV reports the result.'});
      }
      if(method==='GET'&&path==='/api/commands/status'){
        const {venue}=access(req),rawIds=(url.searchParams.get('ids')||'').split(',').filter(Boolean);
        if(!rawIds.length||rawIds.length>100||rawIds.some(v=>!/^\d+$/.test(v)))fail(400,'Choose valid command IDs.');
        const ids=[...new Set(rawIds.map(Number))],all=tvRows(venue.id),commands=[];
        for(const commandId of ids){const row=db.get('SELECT c.*,t.name AS tv_name,t.last_seen FROM commands c JOIN tvs t ON t.id=c.tv_id WHERE c.id=? AND t.venue_id=?',commandId,venue.id);if(!row)fail(404,'Command not found.');const payload=parse(row.payload,{});let status=payload.result||null;if(!status){const online=!!row.last_seen&&now()-row.last_seen<45000;status=row.expires_at<=now()||!online?'offline':'pending';}commands.push({id:row.id,tvId:row.tv_id,tvName:row.tv_name,kind:row.kind,status,detail:payload.resultDetail||''});}
        return json(res,200,{commands});
      }
      if(method==='GET'&&path==='/api/player/state'){
        const {tv,venue}=device(req),current=effective(tv,venue);
        const commands=db.all('SELECT id,kind,payload FROM commands WHERE tv_id=? AND ack_at IS NULL AND expires_at>? ORDER BY id LIMIT 100',tv.id,now()).map(c=>({...c,payload:parse(c.payload)}));
        const presentation=db.get("SELECT te.id,te.code,te.name,te.status,te.phase,te.phase_deadline,te.active_matchup_id,ep.group_name FROM event_presentations ep JOIN tasting_events te ON te.id=ep.event_id WHERE ep.venue_id=? AND ep.active=1 AND te.status IN ('open','live') AND (ep.group_name='' OR ep.group_name=?) ORDER BY ep.updated_at DESC LIMIT 1",venue.id,tv.group_name||'');
        const game=presentation?{id:presentation.id,code:presentation.code,name:presentation.name,status:presentation.status,phase:presentation.phase||'lobby',phaseDeadline:presentation.phase_deadline||null,activeMatchupId:presentation.active_matchup_id||null,teamRules:teamRules(db,presentation.id),teams:teamRows(db,presentation.id),joinUrl:`${config.APP_ORIGIN}/games/${presentation.code}?v=${venue.qr_code}`,joinQrImage:current.playbackMode!=='clean'&&current.showQr!==false?`/game-qr/${presentation.code}/${venue.qr_code}.svg`:null,entries:db.all('SELECT id,seed,name FROM tasting_entries WHERE event_id=? ORDER BY seed',presentation.id),matchups:db.all('SELECT m.id,m.round,m.slot,m.entry_a_id AS entryAId,m.entry_b_id AS entryBId,o.winner_entry_id AS winnerEntryId,o.revision FROM tasting_matchups m LEFT JOIN tasting_outcomes o ON o.matchup_id=m.id WHERE m.event_id=? ORDER BY m.round,m.slot',presentation.id),standings:scoreRows(db,presentation.id).slice(0,10).map(row=>({...row,points:row.totalPoints}))}:null;
        return json(res,200,{tvId:tv.id,venueName:venue.name,...current,accent:venue.accent,commands,game,serverTime:now(),promotions:db.all('SELECT id,title,description,starts_at,ends_at FROM promotions WHERE venue_id=? AND active=1 AND starts_at<=? AND ends_at>?',venue.id,now(),now())});
      }
      if(method==='POST'&&path==='/api/player/heartbeat'){
        const {tv}=device(req);const seconds=integer(b.cacheSeconds??0,'Cached seconds',0,864000),bytes=integer(b.cacheBytes??0,'Cached bytes',0,100000000000);
        db.run('UPDATE tvs SET last_seen=?,cache_seconds=?,cache_bytes=?,playing=?,current_title=? WHERE id=?',now(),seconds,bytes,b.playing===true?1:0,text(b.title||'','Title',160,true),tv.id);return json(res,200,{ok:true});
      }
      if(method==='POST'&&path==='/api/player/ack'){
        const {tv}=device(req);integer(b.id,'Command ID',1,Number.MAX_SAFE_INTEGER);
        const command=db.get('SELECT id,payload FROM commands WHERE id=? AND tv_id=?',b.id,tv.id);if(!command)fail(404,'Command not found.');
        const result=b.status===undefined?'applied':choice(b.status,['applied','blocked'],'command result'),detail=text(b.detail||'','Result detail',160,true),payload={...parse(command.payload,{}),result,resultDetail:detail};
        transaction(()=>{db.run('UPDATE commands SET payload=?,ack_at=COALESCE(ack_at,?) WHERE id=? AND tv_id=?',JSON.stringify(payload),now(),b.id,tv.id);db.run('UPDATE tvs SET last_ack=MAX(last_ack,?) WHERE id=?',b.id,tv.id);});return json(res,200,{ok:true,status:result});
      }
      if(method==='GET'&&path==='/api/player/manifest'){
        const {tv,venue}=device(req);rateLimit(db,`manifest:${tv.id}`,40,60000);return json(res,200,manifest(tv,venue));
      }
      if(method==='POST'&&path==='/api/player/events'){
        const {tv}=device(req);if(!Array.isArray(b.events)||b.events.length>100)fail(400,'Send at most 100 events.');
        return json(res,200,ingestPlaybackEvents(db,tv,b.events,now()));
      }
}
