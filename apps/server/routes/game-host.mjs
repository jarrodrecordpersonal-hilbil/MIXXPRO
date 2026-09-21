import {eventView} from './games.mjs';
import {scoreRows,teamRows} from '../game-standings.mjs';

export async function gameHostRoutes({req,res,path,method,b,db,json,access,text,fail,audit,now}){
  if(method==='GET'&&path==='/api/games'){
    access(req,true);
    return json(res,200,{events:db.all("SELECT id,code,name,status,phase FROM tasting_events WHERE status!='draft' ORDER BY updated_at DESC,id LIMIT 100")});
  }
  const route=/^\/api\/games\/([^/]+)\/(host|stop-presenting)$/.exec(path);
  if(!route||!((method==='GET'&&route[2]==='host')||(method==='POST'&&route[2]==='stop-presenting')))return;
  const {user,venue}=access(req,true),event=db.get("SELECT * FROM tasting_events WHERE id=? AND status!='draft'",route[1]);
  if(!event)fail(404,'Event not found.');
  if(route[2]==='stop-presenting'){
    const groupName=text(b.groupName||'','TV group',40,true);
    db.run('UPDATE event_presentations SET active=0,updated_at=? WHERE event_id=? AND venue_id=? AND group_name=?',now(),event.id,venue.id,groupName);
    audit(user.id,venue.id,'game.presentation.stopped',{eventId:event.id,groupName});
    return json(res,200,{ok:true});
  }
  const assignedJudges=db.all('SELECT j.id,j.name FROM tasting_judges j JOIN tasting_judge_users ju ON ju.judge_id=j.id WHERE j.event_id=? AND ju.user_id=? ORDER BY j.name',event.id,user.id);
  const canPublish=user.platform_role==='admin';
  // Venue presentation access never grants access to another judge's private choices.
  const submissions=db.all('SELECT s.matchup_id AS matchupId,s.judge_id AS judgeId,s.winner_entry_id AS winnerEntryId FROM tasting_judge_submissions s JOIN tasting_matchups m ON m.id=s.matchup_id WHERE m.event_id=?',event.id)
    .filter(s=>canPublish||assignedJudges.some(j=>j.id===s.judgeId));
  return json(res,200,{
    event:eventView(db,event),
    lockedMatchupIds:db.all('SELECT id FROM tasting_matchups WHERE event_id=? AND predictions_locked_at IS NOT NULL',event.id).map(m=>m.id),
    capabilities:{canControl:!!db.get('SELECT 1 FROM tasting_event_operators WHERE event_id=? AND user_id=?',event.id,user.id),canPublish},
    assignedJudges,submissions,standings:scoreRows(db,event.id),teams:teamRows(db,event.id),
    tvGroups:db.all('SELECT group_name AS name,COUNT(*) AS count FROM tvs WHERE venue_id=? AND revoked=0 GROUP BY group_name ORDER BY group_name',venue.id),
    presentations:db.all('SELECT group_name AS groupName FROM event_presentations WHERE event_id=? AND venue_id=? AND active=1 ORDER BY group_name',event.id,venue.id)
  });
}
