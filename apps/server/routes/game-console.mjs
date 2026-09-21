import {eventView} from './games.mjs';
import {scoreRows} from '../game-standings.mjs';

// Restricted rehearsal surface. This does not enable non-demo event creation,
// role assignment, guest hosting, prizes, or a production pilot.
export async function gameConsoleRoutes(context){
  const {req,res,path,method,b,db,config,json,access,fail,tvRows,now,text,audit}=context;
  const listing=method==='GET'&&path==='/api/games/console';
  const detail=method==='GET'&&/^\/api\/games\/[^/]+\/console$/.test(path);
  const stop=method==='POST'&&/^\/api\/games\/[^/]+\/stop-presenting$/.test(path);
  if(!listing&&!detail&&!stop)return;
  const {user,venue}=access(req,true);
  if(!config.DEMO_MODE)fail(404,'The game control room is available only in demo mode.');
  if(listing)return json(res,200,{
    events:db.all("SELECT id,code,name,status,phase FROM tasting_events WHERE status!='draft' ORDER BY created_at DESC,id LIMIT 50"),
    canCreateDemo:user.platform_role==='admin'
  });
  const event=db.get("SELECT * FROM tasting_events WHERE id=? AND status!='draft'",path.split('/')[3]);
  if(!event)fail(404,'Event not found.');
  if(stop){
    const groupName=text(b.groupName??'','TV group',40,true);
    db.run('UPDATE event_presentations SET active=0,updated_at=? WHERE event_id=? AND venue_id=? AND group_name=?',now(),event.id,venue.id,groupName);
    audit(user.id,venue.id,'game.presentation.stopped',{eventId:event.id,groupName});
    return json(res,200,{ok:true});
  }
  const assigned=db.all('SELECT j.id FROM tasting_judges j JOIN tasting_judge_users u ON u.judge_id=j.id WHERE j.event_id=? AND u.user_id=?',event.id,user.id);
  return json(res,200,{
    event:eventView(db,event),serverNow:now(),venue:{id:venue.id,name:venue.name},
    permissions:{canOperate:!!db.get('SELECT 1 FROM tasting_event_operators WHERE event_id=? AND user_id=?',event.id,user.id),canPublish:user.platform_role==='admin',judgeIds:assigned.map(j=>j.id)},
    lockedMatchupIds:db.all('SELECT id FROM tasting_matchups WHERE event_id=? AND predictions_locked_at IS NOT NULL',event.id).map(m=>m.id),
    // Only this user's assigned judges' choices. Operators and presenters must
    // not receive another judge's unpublished choices through this new read API.
    mySubmissions:db.all('SELECT s.matchup_id AS matchupId,s.judge_id AS judgeId,s.winner_entry_id AS winnerEntryId FROM tasting_judge_submissions s JOIN tasting_judges j ON j.id=s.judge_id JOIN tasting_judge_users u ON u.judge_id=j.id WHERE j.event_id=? AND u.user_id=?',event.id,user.id),
    groups:[...new Set(tvRows(venue.id).map(tv=>tv.group_name).filter(Boolean))].sort(),
    presentations:db.all('SELECT group_name AS groupName FROM event_presentations WHERE event_id=? AND venue_id=? AND active=1',event.id,venue.id),
    standings:scoreRows(db,event.id)
  });
}
