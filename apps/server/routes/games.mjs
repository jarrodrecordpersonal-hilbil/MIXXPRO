const participantCookie=req=>((req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('mixx_game='))||'').slice(10);
const participantFor=(db,eventId,raw,hash)=>raw?db.get('SELECT p.id,p.display_name FROM game_participant_credentials c JOIN game_participants p ON p.id=c.participant_id WHERE c.event_id=? AND c.credential_hash=? AND c.revoked_at IS NULL AND p.event_id=?',eventId,hash(raw),eventId):null;
function eventView(db,event){
 const entries=db.all('SELECT id,seed,name,story FROM tasting_entries WHERE event_id=? ORDER BY seed',event.id);
 const matchups=db.all('SELECT id,round,slot,entry_a_id AS entryAId,entry_b_id AS entryBId FROM tasting_matchups WHERE event_id=? ORDER BY round,slot',event.id);
 const judges=db.all('SELECT id,name FROM tasting_judges WHERE event_id=? ORDER BY name',event.id);
 const outcomes=db.all('SELECT o.matchup_id AS matchupId,o.winner_entry_id AS winnerEntryId,o.revision,o.published_at AS publishedAt,o.corrected_at AS correctedAt FROM tasting_outcomes o JOIN tasting_matchups m ON m.id=o.matchup_id WHERE m.event_id=?',event.id);
 return {id:event.id,code:event.code,name:event.name,status:event.status,phase:event.phase||'lobby',phaseDeadline:event.phase_deadline||null,activeMatchupId:event.active_matchup_id||null,scoringVersion:event.scoring_version,entries,matchups,judges,outcomes};
}
function scoreRows(db,eventId){
 const participants=db.all('SELECT id,display_name FROM game_participants WHERE event_id=?',eventId),outcomes=new Map(db.all('SELECT o.matchup_id matchupId,o.winner_entry_id winnerEntryId FROM tasting_outcomes o JOIN tasting_matchups m ON m.id=o.matchup_id WHERE m.event_id=?',eventId).map(x=>[x.matchupId,x.winnerEntryId]));
 return participants.map(p=>{const predictions=db.all('SELECT matchup_id matchupId,prediction_kind kind,judge_id judgeId,entry_id entryId FROM game_predictions WHERE participant_id=?',p.id);const bracket=predictions.filter(x=>x.kind==='bracket').reduce((n,x)=>n+(outcomes.get(x.matchupId)===x.entryId?1:0),0);const judge=predictions.filter(x=>x.kind==='judge').reduce((n,x)=>{const submission=db.get('SELECT winner_entry_id winner FROM tasting_judge_submissions WHERE matchup_id=? AND judge_id=?',x.matchupId,x.judgeId);return n+(submission?.winner===x.entryId?1:0);},0);return {participantId:p.id,name:p.display_name,bracketPoints:bracket,judgePoints:judge,totalPoints:bracket+judge};}).sort((a,b)=>b.totalPoints-a.totalPoints||a.name.localeCompare(b.name));
}
export async function gameRoutes(context){
 const {req,res,path,method,b,db,config,json,audit,transaction,access,admin,id,now,token,hash,fail,text}=context;
 if(method==='POST'&&path==='/api/admin/games/proof-trials-demo'){
  const user=admin(req);if(!config.DEMO_MODE)fail(403,'Proof Trials fixtures are available only in demo mode.');
  const existing=db.get("SELECT id,code FROM tasting_events WHERE code='PROOF26'");if(existing)return json(res,200,{ok:true,...existing});
  const eventId=id(),created=now(),names=['Oak & Ember','River Proof','Warehouse Nine','Copper Trail'];
  transaction(()=>{db.run("INSERT INTO tasting_events(id,code,name,status,created_at,updated_at) VALUES(?,?,?,?,?,?)",eventId,'PROOF26','Proof Trials · Fictional Demo','open',created,created);
   const entryIds=names.map((name,i)=>{const x=id();db.run('INSERT INTO tasting_entries(id,event_id,seed,name,story) VALUES(?,?,?,?,?)',x,eventId,i+1,name,'Fictional tasting entry for product testing.');return x;});
   db.run('INSERT INTO tasting_matchups(id,event_id,round,slot,entry_a_id,entry_b_id) VALUES(?,?,?,?,?,?)',id(),eventId,1,1,entryIds[0],entryIds[1]);
   db.run('INSERT INTO tasting_matchups(id,event_id,round,slot,entry_a_id,entry_b_id) VALUES(?,?,?,?,?,?)',id(),eventId,1,2,entryIds[2],entryIds[3]);
   for(const name of ['Judge Rowan','Judge Ellis'])db.run('INSERT INTO tasting_judges(id,event_id,name) VALUES(?,?,?)',id(),eventId,name);
   db.run('INSERT INTO tasting_event_operators(event_id,user_id,created_at) VALUES(?,?,?)',eventId,user.id,created);
   const firstJudge=db.get('SELECT id FROM tasting_judges WHERE event_id=? ORDER BY name LIMIT 1',eventId);if(firstJudge)db.run('INSERT INTO tasting_judge_users(judge_id,user_id,created_at) VALUES(?,?,?)',firstJudge.id,user.id,created);
  });audit(user.id,null,'proof_trials.demo_created',{eventId});return json(res,201,{ok:true,id:eventId,code:'PROOF26'});
 }
 if(method==='POST'&&path.startsWith('/api/public/games/')&&path.endsWith('/link-device')){
  const code=path.split('/')[4],event=db.get("SELECT * FROM tasting_events WHERE code=? AND status!='draft'",code);if(!event)fail(404,'Event not found.');
  const raw=participantCookie(req);if(!raw)fail(401,'Join the event first.');const participant=participantFor(db,event.id,raw,hash);if(!participant)fail(401,'Join the event first.');
  const link=token(9).toUpperCase(),expires=now()+10*60000;transaction(()=>{db.run('DELETE FROM game_identity_links WHERE participant_id=? AND used_at IS NULL',participant.id);db.run('INSERT INTO game_identity_links(code_hash,participant_id,expires_at) VALUES(?,?,?)',hash(link),participant.id,expires);});return json(res,201,{code:link,expiresAt:expires});
 }
 if(method==='POST'&&path.startsWith('/api/public/games/')&&path.endsWith('/resume')){
  const code=path.split('/')[4],event=db.get("SELECT * FROM tasting_events WHERE code=? AND status!='draft'",code);if(!event)fail(404,'Event not found.');
  const link=text(b.code,'Resume code',20).toUpperCase(),row=db.get('SELECT l.*,p.event_id,p.display_name FROM game_identity_links l JOIN game_participants p ON p.id=l.participant_id WHERE l.code_hash=? AND l.expires_at>? AND l.used_at IS NULL',hash(link),now());if(!row||row.event_id!==event.id)fail(400,'Resume code is invalid or expired.');
  let raw=participantCookie(req),credentialHash=raw?hash(raw):null,existing=credentialHash?db.get('SELECT participant_id FROM game_participant_credentials WHERE event_id=? AND credential_hash=? AND revoked_at IS NULL',event.id,credentialHash):null;if(existing&&existing.participant_id!==row.participant_id)fail(409,'This device already has a different participant in this event.');
  if(!raw){raw=token(32);credentialHash=hash(raw);}
  transaction(()=>{const fresh=db.get('SELECT used_at,expires_at FROM game_identity_links WHERE code_hash=?',hash(link));if(!fresh||fresh.used_at!==null||fresh.expires_at<=now())fail(400,'Resume code is invalid or expired.');db.run('INSERT OR IGNORE INTO game_participant_credentials(event_id,credential_hash,participant_id,created_at) VALUES(?,?,?,?)',event.id,credentialHash,row.participant_id,now());db.run('UPDATE game_identity_links SET used_at=? WHERE code_hash=? AND used_at IS NULL',now(),hash(link));db.run('UPDATE game_participants SET last_seen=? WHERE id=?',now(),row.participant_id);});
  res.setHeader('Set-Cookie','mixx_game='+raw+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000'+(config.PRODUCTION?'; Secure':''));return json(res,200,{participant:{id:row.participant_id,name:row.display_name},event:eventView(db,event)});
 }
 if(method==='POST'&&path.startsWith('/api/games/')&&path.endsWith('/phase')){
  const {venue,user}=access(req,true),eventId=path.split('/')[3],event=db.get('SELECT * FROM tasting_events WHERE id=?',eventId);if(!event)fail(404,'Event not found.');
  if(!db.get('SELECT 1 FROM tasting_event_operators WHERE event_id=? AND user_id=?',eventId,user.id))fail(403,'Event operator access required.');
  const phase=['lobby','predictions','judging','results','complete'].includes(b.phase)?b.phase:null;if(!phase)fail(400,'Choose a valid event phase.');
  let matchupId=null;if(b.matchupId){const m=db.get('SELECT id FROM tasting_matchups WHERE id=? AND event_id=?',text(b.matchupId,'Matchup',80),eventId);if(!m)fail(404,'Matchup not found.');matchupId=m.id;}
  const seconds=b.seconds===undefined?null:Math.max(5,Math.min(3600,Number(b.seconds)||0)),deadline=seconds===null?null:now()+seconds*1000,status=phase==='complete'?'final':'live';db.run('UPDATE tasting_events SET phase=?,phase_deadline=?,active_matchup_id=?,status=?,updated_at=? WHERE id=?',phase,deadline,matchupId,status,now(),eventId);audit(user.id,venue.id,'game.phase.changed',{eventId,phase,matchupId,deadline});return json(res,200,{ok:true,event:eventView(db,db.get('SELECT * FROM tasting_events WHERE id=?',eventId))});
 }
 if(method==='POST'&&path.startsWith('/api/games/')&&path.endsWith('/judge-submit')){
  const {venue,user}=access(req,true),eventId=path.split('/')[3];
  const matchup=db.get('SELECT * FROM tasting_matchups WHERE id=? AND event_id=?',text(b.matchupId,'Matchup',80),eventId);if(!matchup)fail(404,'Matchup not found.');const judgeId=text(b.judgeId,'Judge',80);if(!db.get('SELECT j.id FROM tasting_judges j JOIN tasting_judge_users ju ON ju.judge_id=j.id WHERE j.id=? AND j.event_id=? AND ju.user_id=?',judgeId,eventId,user.id))fail(403,'Assigned judge access required.');const winner=text(b.winnerEntryId,'Winner',80);if(![matchup.entry_a_id,matchup.entry_b_id].includes(winner))fail(400,'Winner must be in the matchup.');
  db.run('INSERT INTO tasting_judge_submissions(matchup_id,judge_id,winner_entry_id,submitted_at) VALUES(?,?,?,?) ON CONFLICT(matchup_id,judge_id) DO UPDATE SET winner_entry_id=excluded.winner_entry_id,submitted_at=excluded.submitted_at',matchup.id,judgeId,winner,now());audit(user.id,venue.id,'game.judge.submitted',{eventId,matchupId:matchup.id,judgeId});return json(res,200,{ok:true});
 }
 if(method==='GET'&&path.startsWith('/api/public/games/')){
  const code=path.split('/')[4],event=db.get("SELECT * FROM tasting_events WHERE code=? AND status!='draft'",code);if(!event)fail(404,'Event not found.');
  const raw=participantCookie(req),participant=participantFor(db,event.id,raw,hash);
  return json(res,200,{event:eventView(db,event),participant,standings:scoreRows(db,event.id),scoring:{bracket:'1 point for each published matchup winner predicted correctly.',judge:'1 point for each named judge choice predicted correctly.'}});
 }
 if(method==='POST'&&path.startsWith('/api/public/games/')&&path.endsWith('/join')){
  const code=path.split('/')[4],event=db.get("SELECT * FROM tasting_events WHERE code=? AND status IN ('open','live')",code);if(!event)fail(404,'This event is not open.');
  const displayName=text(b.name,'Display name',40),kind=b.locationKind==='venue'?'venue':'home',roomKey=kind==='venue'?text(b.roomKey||'','Room',40,true):'home';
  let raw=participantCookie(req);if(!raw){raw=token(32);res.setHeader('Set-Cookie',`mixx_game=${raw}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${config.PRODUCTION?'; Secure':''}`);}
  const identity=hash(raw),created=now();let participant=participantFor(db,event.id,raw,hash);
  if(!participant){const participantId=id();transaction(()=>{db.run('INSERT INTO game_participants(id,event_id,identity_hash,display_name,created_at,last_seen) VALUES(?,?,?,?,?,?)',participantId,event.id,identity,displayName,created,created);db.run('INSERT INTO game_participant_credentials(event_id,credential_hash,participant_id,created_at) VALUES(?,?,?,?)',event.id,identity,participantId,created);});participant=db.get('SELECT * FROM game_participants WHERE id=?',participantId);}else db.run('UPDATE game_participants SET display_name=?,last_seen=? WHERE id=?',displayName,created,participant.id);
  const venueId=kind==='venue'&&typeof b.venueId==='string'?b.venueId:null;db.run('INSERT INTO game_participation(participant_id,location_kind,venue_id,room_key,last_seen) VALUES(?,?,?,?,?) ON CONFLICT(participant_id,location_kind,room_key) DO UPDATE SET last_seen=excluded.last_seen',participant.id,kind,venueId,roomKey,created);
  return json(res,200,{participant:{id:participant.id,name:displayName},event:eventView(db,event)});
 }
 if(method==='POST'&&path.startsWith('/api/public/games/')&&path.endsWith('/predict')){
  const code=path.split('/')[4],event=db.get("SELECT * FROM tasting_events WHERE code=? AND status IN ('open','live')",code);if(!event)fail(409,'Predictions are closed.');if(event.status==='live'&&(event.phase!=='predictions'||(event.phase_deadline&&event.phase_deadline<=now())))fail(409,'Predictions are closed.');
  const raw=participantCookie(req);if(!raw)fail(401,'Join the event first.');const participant=participantFor(db,event.id,raw,hash);if(!participant)fail(401,'Join the event first.');
  const matchup=db.get('SELECT * FROM tasting_matchups WHERE id=? AND event_id=?',text(b.matchupId,'Matchup',80),event.id);if(!matchup)fail(404,'Matchup not found.');
  const entryId=text(b.entryId,'Entry',80);if(![matchup.entry_a_id,matchup.entry_b_id].includes(entryId))fail(400,'Choose an entry in this matchup.');
  const kind=b.kind==='judge'?'judge':'bracket';let judgeId='';if(kind==='judge'){judgeId=text(b.judgeId,'Judge',80);if(!db.get('SELECT id FROM tasting_judges WHERE id=? AND event_id=?',judgeId,event.id))fail(404,'Judge not found.');}
  db.run('INSERT INTO game_predictions(participant_id,matchup_id,prediction_kind,judge_id,entry_id,submitted_at) VALUES(?,?,?,?,?,?) ON CONFLICT(participant_id,matchup_id,prediction_kind,judge_id) DO UPDATE SET entry_id=excluded.entry_id,submitted_at=excluded.submitted_at',participant.id,matchup.id,kind,judgeId,entryId,now());return json(res,200,{ok:true});
 }
 if(method==='POST'&&path.startsWith('/api/games/')&&path.endsWith('/present')){
  const {venue,user}=access(req,true),eventId=path.split('/')[3],event=db.get("SELECT * FROM tasting_events WHERE id=? AND status IN ('open','live')",eventId);if(!event)fail(404,'Event not found.');
  const groupName=text(b.groupName||'','TV group',40,true);if(groupName&&!db.get('SELECT id FROM tvs WHERE venue_id=? AND group_name=? AND revoked=0',venue.id,groupName))fail(404,'TV group not found.');
  db.run('INSERT INTO event_presentations(event_id,venue_id,group_name,active,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(event_id,venue_id,group_name) DO UPDATE SET active=1,updated_at=excluded.updated_at',event.id,venue.id,groupName,1,now(),now());audit(user.id,venue.id,'game.presented',{eventId,groupName});return json(res,200,{ok:true});
 }
 if(method==='POST'&&path.startsWith('/api/admin/games/')&&path.endsWith('/publish-outcome')){
  const user=admin(req),eventId=path.split('/')[4],matchup=db.get('SELECT * FROM tasting_matchups WHERE id=? AND event_id=?',text(b.matchupId,'Matchup',80),eventId);if(!matchup)fail(404,'Matchup not found.');const winner=text(b.winnerEntryId,'Winner',80);if(![matchup.entry_a_id,matchup.entry_b_id].includes(winner))fail(400,'Winner must be in the matchup.');
  const prior=db.get('SELECT * FROM tasting_outcomes WHERE matchup_id=?',matchup.id),stamp=now();db.run('INSERT INTO tasting_outcomes(matchup_id,winner_entry_id,revision,published_at,corrected_at) VALUES(?,?,?,?,?) ON CONFLICT(matchup_id) DO UPDATE SET winner_entry_id=excluded.winner_entry_id,revision=tasting_outcomes.revision+1,corrected_at=excluded.published_at',matchup.id,winner,prior?prior.revision+1:1,stamp,prior?stamp:null);audit(user.id,null,'game.outcome.published',{eventId,matchupId:matchup.id,corrected:!!prior});return json(res,200,{ok:true,standings:scoreRows(db,eventId)});
 }
}
