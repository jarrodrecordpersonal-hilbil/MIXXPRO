/** One authoritative score projection for phones, TVs and result publication. */
export function scoreRows(db,eventId){
  const participants=db.all('SELECT id,display_name FROM game_participants WHERE event_id=?',eventId);
  const outcomes=new Map(db.all('SELECT o.matchup_id matchupId,o.winner_entry_id winnerEntryId FROM tasting_outcomes o JOIN tasting_matchups m ON m.id=o.matchup_id WHERE m.event_id=?',eventId).map(row=>[row.matchupId,row.winnerEntryId]));
  return participants.map(participant=>{
    const predictions=db.all('SELECT matchup_id matchupId,prediction_kind kind,judge_id judgeId,entry_id entryId FROM game_predictions WHERE participant_id=?',participant.id);
    let bracketPoints=0,judgePoints=0;
    for(const prediction of predictions){
      // A judge's private submission must never become a score oracle.
      if(!outcomes.has(prediction.matchupId))continue;
      if(prediction.kind==='bracket')bracketPoints+=Number(outcomes.get(prediction.matchupId)===prediction.entryId);
      if(prediction.kind==='judge'){
        const submission=db.get('SELECT winner_entry_id winner FROM tasting_judge_submissions WHERE matchup_id=? AND judge_id=?',prediction.matchupId,prediction.judgeId);
        judgePoints+=Number(submission?.winner===prediction.entryId);
      }
    }
    return {participantId:participant.id,name:participant.display_name,bracketPoints,judgePoints,totalPoints:bracketPoints+judgePoints};
  }).sort((a,b)=>b.totalPoints-a.totalPoints||a.name.localeCompare(b.name)||a.participantId.localeCompare(b.participantId));
}

export function teamRules(db,eventId){
 const r=db.get('SELECT team_size AS size,scoring_version AS scoringVersion,locked_at AS lockedAt FROM game_team_rules WHERE event_id=?',eventId);
 return r?{...r,locked:r.lockedAt!==null,description:`Exactly ${r.size} account players per store. Join before the first prediction window. One store per player, fixed for this event. Complete rosters compete on the sum of published personal points; equal totals share rank.`}:null;
}
export function teamRows(db,eventId,standings=scoreRows(db,eventId)){
 const rules=teamRules(db,eventId);if(!rules)return [];
 const points=new Map(standings.map(p=>[p.participantId,p])),teams=new Map();
 for(const member of db.all('SELECT m.venue_id AS venueId,v.name,a.participant_id AS participantId FROM game_team_memberships m JOIN venues v ON v.id=m.venue_id JOIN game_account_participants a ON a.user_id=m.user_id AND a.event_id=m.event_id WHERE m.event_id=? ORDER BY m.joined_at,m.user_id',eventId)){
  if(!teams.has(member.venueId))teams.set(member.venueId,{venueId:member.venueId,name:member.name,memberCount:0,capacity:rules.size,points:0,rank:null});
  const team=teams.get(member.venueId);team.memberCount++;team.points+=points.get(member.participantId)?.totalPoints||0;
 }
 const rows=[...teams.values()].map(t=>({...t,status:t.memberCount===rules.size?(rules.locked?'competing':'ready'):(rules.locked?'incomplete':'forming')}));
 rows.sort((a,b)=>Number(b.status==='competing')-Number(a.status==='competing')||b.points-a.points||a.name.localeCompare(b.name)||a.venueId.localeCompare(b.venueId));
 let rank=0,count=0,last=null;
 for(const team of rows)if(team.status==='competing'){count++;if(last!==team.points)rank=count;team.rank=rank;last=team.points;}
 return rows;
}
