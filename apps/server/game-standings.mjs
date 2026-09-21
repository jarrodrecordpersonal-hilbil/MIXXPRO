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
