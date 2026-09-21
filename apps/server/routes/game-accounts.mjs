import {accountWrite,bindAccount,gameAccountView,accountParticipant} from '../game-identity.mjs';
import {scoreRows} from '../game-standings.mjs';

export async function gameAccountRoutes(c){
 const {req,res,path,method,b,db,config,json,fail,text,rateLimit,ip,hash,passwordHash,verifyPassword,issueSession,id,now,transaction,audit}=c;
 const root='/api/public/game-account',eventRoute=/^\/api\/public\/games\/([A-Za-z0-9_-]+)\/(save-account|team)$/.exec(path);
 if(!path.startsWith(root)&&!eventRoute)return;
 if(!config.GAME_ACCOUNTS_ENABLED)fail(404,'Player accounts are not enabled for this pilot.');
 if(method==='GET'&&path===root){
  const user=c.requireSession(req),events=db.all("SELECT e.id,e.code,e.name,e.status,a.participant_id FROM game_account_participants a JOIN tasting_events e ON e.id=a.event_id WHERE a.user_id=? AND e.status!='draft' ORDER BY e.updated_at DESC,e.id LIMIT 30",user.id);
  return json(res,200,{...gameAccountView(c,''),history:events.map(e=>({code:e.code,name:e.name,status:e.status,points:scoreRows(db,e.id).find(p=>p.participantId===e.participant_id)?.totalPoints||0}))});
 }
 if(method!=='POST')return;
 if(path===root+'/register'||path===root+'/login'){
  if(c.readSession(req))fail(409,'Sign out before signing into another account.');
  rateLimit(db,'game-auth-ip:'+ip,300,900000);
  const email=text(b.email,'Email',254).toLowerCase(),password=text(b.password,'Password',200);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Enter a valid email.');
  rateLimit(db,'account:'+hash(email),15,900000);
  if(path.endsWith('/login')){
   const user=db.get('SELECT * FROM users WHERE email=?',email);
   const valid=await verifyPassword(password,user?.password_hash||`${'0'.repeat(22)}:${'0'.repeat(128)}`);
   if(!user||!valid)fail(401,'Email or password is incorrect.');
   issueSession(res,user.id);return json(res,200,{ok:true});
  }
  if(!config.SIGNUPS_ENABLED)fail(403,'New account creation is temporarily unavailable.');
  rateLimit(db,'game-signup:'+ip,100,3600000);
  if(password.length<12)fail(400,'Use at least 12 characters for your password.');
  const name=text(b.name,'Public player name',40),pw=await passwordHash(password),userId=id();
  transaction(()=>{
   if(db.get('SELECT id FROM users WHERE email=?',email))fail(409,'This email cannot be registered. Try signing in.');
   db.run('INSERT INTO users(id,email,password_hash,name,created_at) VALUES(?,?,?,?,?)',userId,email,pw,name,now());
   db.run('INSERT INTO game_profiles(user_id,display_name,created_at) VALUES(?,?,?)',userId,name,now());
  });
  issueSession(res,userId);audit(userId,null,'game.account.created');return json(res,201,{ok:true});
 }
 const user=accountWrite(c);rateLimit(db,'game-account-write:'+user.id,60,60000);
 if(path===root+'/profile'){
  const name=text(b.name,'Public player name',40);
  db.run('INSERT INTO game_profiles(user_id,display_name,created_at) VALUES(?,?,?) ON CONFLICT(user_id) DO NOTHING',user.id,name,now());
  return json(res,200,{ok:true});
 }
 if(path===root+'/password'){
  const current=text(b.currentPassword,'Current password',200),next=text(b.password,'New password',200);
  if(next.length<12)fail(400,'Use at least 12 characters for your password.');
  rateLimit(db,'game-password:'+user.id,5,900000);
  const stored=db.get('SELECT password_hash FROM users WHERE id=?',user.id).password_hash;
  if(!await verifyPassword(current,stored))fail(401,'Current password is incorrect.');
  const pw=await passwordHash(next);
  transaction(()=>{
   if(db.get('SELECT password_hash FROM users WHERE id=?',user.id).password_hash!==stored)fail(409,'Password changed. Sign in again.');
   db.run('UPDATE users SET password_hash=? WHERE id=?',pw,user.id);db.run('DELETE FROM sessions WHERE user_id=?',user.id);
  });
  issueSession(res,user.id);audit(user.id,null,'game.account.password_changed');return json(res,200,{ok:true});
 }
 if(!eventRoute)return;
 const event=db.get("SELECT * FROM tasting_events WHERE code=? AND status!='draft'",eventRoute[1]);if(!event)fail(404,'Event not found.');
 if(eventRoute[2]==='save-account'){
  const participant=transaction(()=>bindAccount(c,event,user));audit(user.id,null,'game.account.linked',{eventId:event.id,participantId:participant.id});
  return json(res,200,{ok:true});
 }
 const venueCode=text(b.venueCode,'Venue code',40);
 transaction(()=>{
  const participant=accountParticipant(c,event.id,user);if(!participant)fail(409,'Save this player to your account before joining a store team.');
  const venue=db.get('SELECT v.id FROM venues v JOIN event_presentations p ON p.venue_id=v.id WHERE v.qr_code=? AND p.event_id=? AND p.active=1 LIMIT 1',venueCode,event.id);
  if(!venue)fail(409,'This store is not presenting the event. Scan its current game QR.');
  const membership=db.get('SELECT venue_id FROM game_team_memberships WHERE user_id=? AND event_id=?',user.id,event.id);
  if(membership){if(membership.venue_id!==venue.id)fail(409,'Your store team is fixed for this event.');return;}
  const rules=db.get('SELECT * FROM game_team_rules WHERE event_id=?',event.id);
  if(!rules||rules.locked_at!==null||event.phase!=='lobby'||!['open','live'].includes(event.status))fail(409,'Team rosters are closed. You can still play individually.');
  if(db.get('SELECT COUNT(*) n FROM game_team_memberships WHERE event_id=? AND venue_id=?',event.id,venue.id).n>=rules.team_size)fail(409,'This store team is full. You can still play individually.');
  db.run('INSERT INTO game_team_memberships(user_id,event_id,venue_id,joined_at) VALUES(?,?,?,?)',user.id,event.id,venue.id,now());
  audit(user.id,venue.id,'game.team.joined',{eventId:event.id,participantId:participant.id});
 });
 return json(res,200,{ok:true});
}
