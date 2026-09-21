export const participantCookie=req=>((req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('mixx_game='))||'').slice(10);

export function guestParticipant(c,eventId){
 const raw=participantCookie(c.req);if(!raw)return null;
 return c.db.get('SELECT p.id,p.display_name FROM game_participant_credentials c JOIN game_participants p ON p.id=c.participant_id LEFT JOIN game_account_participants a ON a.participant_id=p.id WHERE c.event_id=? AND c.credential_hash=? AND c.revoked_at IS NULL AND p.event_id=? AND a.participant_id IS NULL',eventId,c.hash(raw),eventId)||null;
}
export function accountParticipant(c,eventId,user=c.readSession(c.req)){
 return user?c.db.get('SELECT p.id,p.display_name FROM game_account_participants a JOIN game_participants p ON p.id=a.participant_id WHERE a.user_id=? AND a.event_id=?',user.id,eventId)||null:null;
}
export const participantFor=(c,eventId)=>accountParticipant(c,eventId)||guestParticipant(c,eventId);
export function accountWrite(c){
 const user=c.requireSession(c.req);
 if(!c.equal(c.req.headers['x-csrf-token'],user.csrf))c.fail(403,'Refresh the page and try again.');
 return user;
}
export function gameAccountView(c,eventId){
 const user=c.readSession(c.req),profile=user?c.db.get('SELECT display_name AS displayName FROM game_profiles WHERE user_id=?',user.id):null;
 return {enabled:c.config.GAME_ACCOUNTS_ENABLED,signedIn:!!user,userId:user?.id||null,email:user?.email||null,csrf:user?.csrf||null,profile:profile||null,linked:!!accountParticipant(c,eventId,user)};
}
// Called inside a transaction. Never combine two existing players or their picks.
export function bindAccount(c,event,user){
 event=c.db.get('SELECT * FROM tasting_events WHERE id=?',event.id);
 const profile=c.db.get('SELECT display_name FROM game_profiles WHERE user_id=?',user.id);
 if(!profile)c.fail(409,'Create your public player profile first.');
 const existing=accountParticipant(c,event.id,user),guest=guestParticipant(c,event.id);
 if(existing){if(guest&&guest.id!==existing.id)c.fail(409,'Your account already has a player in this event. Its picks remain separate from this browser’s guest player.');return existing;}
 let participant=guest;
 if(!participant){
  if(!['open','live'].includes(event.status))c.fail(409,'Join an open event to create a player.');
  participant={id:c.id(),display_name:profile.display_name};
  c.db.run('INSERT INTO game_participants(id,event_id,identity_hash,display_name,created_at,last_seen) VALUES(?,?,?,?,?,?)',participant.id,event.id,'account:'+user.id,participant.display_name,c.now(),c.now());
 }
 c.db.run('INSERT INTO game_account_participants(user_id,event_id,participant_id,linked_at) VALUES(?,?,?,?)',user.id,event.id,participant.id,c.now());
 c.db.run('DELETE FROM game_identity_links WHERE participant_id=?',participant.id);
 return participant;
}
