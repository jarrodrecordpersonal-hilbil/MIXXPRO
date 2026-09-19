const participantCookie=req=>((req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('mixx_game='))||'').slice(10);
function eventView(db,event){
 const entries=db.all('SELECT id,seed,name,story FROM tasting_entries WHERE event_id=? ORDER BY seed',event.id);
 const matchups=db.all('SELECT id,round,slot,entry_a_id AS entryAId,entry_b_id AS entryBId FROM tasting_matchups WHERE event_id=? ORDER BY round,slot',event.id);
 const judges=db.all('SELECT id,name FROM tasting_judges WHERE event_id=? ORDER BY name',event.id);
 const outcomes=db.all('SELECT o.matchup_id AS matchupId,o.winner_entry_id AS winnerEntryId,o.revision,o.published_at AS publishedAt,o.corrected_at AS correctedAt FROM tasting_outcomes o JOIN tasting_matchups m ON m.id=o.matchup_id WHERE m.event_id=?',event.id);
 return {id:event.id,code:event.code,name:event.name,status:event.status,scoringVersion:event.scoring_version,entries,matchups,judges,outcomes};
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
  });audit(user.id,null,'proof_trials.demo_created',{eventId});return json(res,201,{ok:true,id:eventId,code:'PROOF26'});
 }
 if(method==='GET'&&path.startsWith('/api/public/games/')){
  const code=path.split('/')[4],event=db.get("SELECT * FROM tasting_events WHERE code=? AND status!='draft'",code);if(!event)fail(404,'Event not found.');
  const raw=participantCookie(req),identity=raw?hash(raw):null,participant=identity?db.get('SELECT id,display_name FROM game_participants WHERE event_id=? AND identity_hash=?',event.id,identity):null;
  return json(res,200,{event:eventView(db,event),participant,standings:scoreRows(db,event.id),scoring:{bracket:'1 point for each published matchup winner predicted correctly.',judge:'1 point for each named judge choice predicted correctly.'}});
 }
 if(method==='POST'&&path.startsWith('/api/public/games/')&&path.endsWith('/join')){
  const code=path.split('/')[4],event=db.get("SELECT * FROM tasting_events WHERE code=? AND status IN ('open','live')",code);if(!event)fail(404,'This event is not open.');
  const displayName=text(b.name,'Display name',40),kind=b.locationKind==='venue'?'venue':'home',roomKey=kind==='venue'?text(b.roomKey||'','Room',40,true):'home';
  let raw=participantCookie(req);if(!raw){raw=token(32);res.setHeader('Set-Cookie',`mixx_game=${raw}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${config.PRODUCTION?'; Secure':''}`);}
  const identity=hash(raw),created=now();let participant=db.get('SELECT * FROM game_participants WHERE event_id=? AND identity_hash=?',event.id,identity);
  if(!participant){const participantId=id();db.run('INSERT INTO game_participants(id,event_id,identity_hash,display_name,created_at,last_seen) VALUES(?,?,?,?,?,?)',participantId,event.id,identity,displayName,created,created);participant=db.get('SELECT * FROM game_participants WHERE id=?',participantId);}else db.run('UPDATE game_participants SET display_name=?,last_seen=? WHERE id=?',displayName,created,participant.id);
  const venueId=kind==='venue'&&typeof b.venueId==='string'?b.venueId:null;db.run('INSERT INTO game_participation(participant_id,location_kind,venue_id,room_key,last_seen) VALUES(?,?,?,?,?) ON CONFLICT(participant_id,location_kind,room_key) DO UPDATE SET last_seen=excluded.last_seen',participant.id,kind,venueId,roomKey,created);
  return json(res,200,{participant:{id:participant.id,name:displayName},event:eventView(db,event)});
 }
 if(method==='POST'&&path.startsWith('/api/public/games/')&&path.endsWith('/predict')){
  const code=path.split('/')[4],event=db.get("SELECT * FROM tasting_events WHERE code=? AND status IN ('open','live')",code);if(!event)fail(409,'Predictions are closed.');
  const raw=participantCookie(req);if(!raw)fail(401,'Join the event first.');const participant=db.get('SELECT * FROM game_participants WHERE event_id=? AND identity_hash=?',event.id,hash(raw));if(!participant)fail(401,'Join the event first.');
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
