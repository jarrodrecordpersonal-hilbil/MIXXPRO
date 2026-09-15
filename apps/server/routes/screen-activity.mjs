import {fail,integer,text,WORLDS} from '../../../packages/domain/src/runtime.mjs';

const DAY = 86400000;
const FROM = `FROM events e
 JOIN tvs t ON t.id=e.tv_id JOIN venues v ON v.id=t.venue_id
 JOIN content c ON c.id=e.content_id LEFT JOIN campaigns campaign ON campaign.id=e.campaign_id
 LEFT JOIN playback_context p ON p.tv_id=e.tv_id AND p.playback_id=e.playback_id`;
const safeLocation = (value,brand) => {
  let location = null;
  try { location = value ? JSON.parse(value) : null; } catch { /* Unknown historical location. */ }
  if (!location) return null;
  return brand ? {city:location.city,region:location.region,country:location.country} : location;
};
const outcome = row => row.completions ? 'ended' : row.skips ? 'skipped' : row.errors ? 'error reported' : row.reportedSeconds > 0 ? 'playback reported' : 'start only';
const needle = value => '%' + value.replace(/[\\%_]/g, '\\$&') + '%';
function number(query,key,fallback,min,max) {
  const raw=query.get(key);if(raw===null)return fallback;
  if(!/^\d+$/.test(raw))fail(400,`Invalid ${key}.`);
  return integer(Number(raw),key,min,max);
}
function scopeFor(ctx) {
  const {req,requireSession,access,url}=ctx,user=requireSession(req);
  const scope=url.searchParams.get('scope') || (user.platform_role==='brand'?'brand':'venue');
  if(scope==='network') {if(user.platform_role!=='admin')fail(403,'Network reports require administrator access.');return {scope,user,venueId:null};}
  if(scope==='brand') {if(user.platform_role!=='brand'||!user.brand_id)fail(403,'An assigned brand account is required.');return {scope,user,venueId:null};}
  if(scope!=='venue')fail(400,'Choose a valid report scope.');
  const {venue,role}=access(req);return {scope,user,venueId:venue.id,role};
}
function selection(ctx,scope) {
  const q=ctx.url.searchParams,now=Date.now();
  const from=number(q,'from',now-7*DAY,0,now+DAY),to=number(q,'to',now+1,0,now+DAY);
  if(from>=to||to-from>31*DAY)fail(400,'Choose a report window of 31 days or less.');
  const asOf=number(q,'asOf',now,Math.max(0,now-DAY),now+1000);
  let where=['e.occurred_at>=?','e.occurred_at<?','e.received_at<=?'],args=[from,to,asOf];
  if(scope.venueId){where.push('t.venue_id=?');args.push(scope.venueId);}
  if(scope.scope==='brand') {where.push('campaign.brand_id=? AND (p.brand_id IS NULL OR p.brand_id=?)');args.push(scope.user.brand_id,scope.user.brand_id);}
  for(const [key,column] of [['venueId','t.venue_id'],['tvId','e.tv_id'],['contentId','e.content_id'],['campaignId','e.campaign_id'],['world','p.world']]) {
    const value=q.get(key);if(value){where.push(column+'=?');args.push(text(value,key,80));}
  }
  for(const [key,column] of [['city',"json_extract(p.location,'$.city')"],['region',"json_extract(p.location,'$.region')"]]){
    const value=q.get(key);if(value){where.push(column+'=? COLLATE NOCASE');args.push(text(value,key,80));}
  }
  if(q.get('q')) {where.push("COALESCE(p.title,c.title) LIKE ? ESCAPE '\\'");args.push(needle(text(q.get('q'),'Video title',120)));}
  const limit=number(q,'limit',50,1,200),offset=number(q,'offset',0,0,1000000);
  return {where:where.join(' AND '),args,from,to,asOf,limit,offset};
}
const GROUP_COLUMNS=`e.tv_id AS tvId,e.playback_id AS playbackId,e.manifest_id AS manifestId,e.content_id AS contentId,e.campaign_id AS campaignId,
 COALESCE(p.title,c.title) AS title,p.world,COALESCE(p.tv_name,t.name) AS tvName,COALESCE(p.venue_name,v.name) AS venueName,t.venue_id AS venueId,
 p.location,p.planned_seconds AS plannedSeconds,p.is_demo AS demo,COALESCE(p.campaign_name,campaign.name) AS campaignName,
 (p.tv_name IS NOT NULL AND p.venue_name IS NOT NULL) AS metadataSnapshot,
 MIN(e.occurred_at) AS firstEventAt,MAX(e.occurred_at) AS lastEventAt,MAX(e.received_at) AS lastReceivedAt,
 MAX(CASE WHEN e.kind IN ('complete','skip') THEN e.occurred_at END) AS endedAt,
 ROUND(SUM(e.seconds),3) AS reportedSeconds,
 ROUND(SUM(CASE WHEN e.delivery_source='cache' THEN e.seconds ELSE 0 END),3) AS cachedSeconds,
 ROUND(SUM(CASE WHEN e.delivery_source='network' THEN e.seconds ELSE 0 END),3) AS networkSeconds,
 SUM(e.kind='complete') AS completions,SUM(e.kind='skip') AS skips,SUM(e.kind='error') AS errors,
 SUM(e.received_at-e.occurred_at>60000) AS delayedEvents,COUNT(*) AS eventCount`;

export async function screenActivityRoutes(ctx) {
  const {req,res,method,path,db,json,access,audit}=ctx;
  if(path==='/api/venue/location'&&method==='PATCH') {
    const {venue,user}=access(req,true),b=ctx.b;
    const values=['address','city','region','postalCode','country'].map(key=>text(b[key]??'',key,key==='address'?160:80,true));
    if(!values[1]||!values[2]||!values[4])fail(400,'Enter the venue city, state/region, and country.');
    db.run(`INSERT INTO venue_locations(venue_id,address,city,region,postal_code,country,updated_at) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(venue_id) DO UPDATE SET address=excluded.address,city=excluded.city,region=excluded.region,postal_code=excluded.postal_code,country=excluded.country,updated_at=excluded.updated_at`,venue.id,...values,Date.now());
    audit(user.id,venue.id,'venue.location.updated');
    return json(res,200,{ok:true,message:'Venue location saved. New programming manifests will use it; historical locations are not rewritten.'});
  }
  if(!['/api/screen-activity','/api/screen-activity/options','/api/screen-activity/events'].includes(path)||method!=='GET')return;
  const scope=scopeFor(ctx);ctx.rateLimit(db,'screen-report:'+scope.user.id,60,60000);
  if(path.endsWith('/options')) {
    let venues;
    if(scope.scope==='network') venues=db.all('SELECT id,name FROM venues ORDER BY name');
    else if(scope.scope==='brand') venues=db.all(`SELECT DISTINCT v.id,v.name FROM venues v JOIN tvs t ON t.venue_id=v.id
      JOIN events e ON e.tv_id=t.id JOIN campaigns c ON c.id=e.campaign_id WHERE c.brand_id=? ORDER BY v.name`,scope.user.brand_id);
    else venues=db.all('SELECT id,name FROM venues WHERE id=?',scope.venueId);
    const chosen=ctx.url.searchParams.get('venueId')||scope.venueId;
    let tvs=[];
    if(chosen&&venues.some(v=>v.id===chosen)){
      tvs=scope.scope==='brand'?db.all(`SELECT DISTINCT t.id,t.name,t.revoked FROM tvs t
        JOIN events e ON e.tv_id=t.id JOIN campaigns campaign ON campaign.id=e.campaign_id
        LEFT JOIN playback_context p ON p.tv_id=e.tv_id AND p.playback_id=e.playback_id
        WHERE t.venue_id=? AND campaign.brand_id=? AND (p.brand_id IS NULL OR p.brand_id=?) ORDER BY t.name`,chosen,scope.user.brand_id,scope.user.brand_id)
        :db.all('SELECT id,name,revoked FROM tvs WHERE venue_id=? ORDER BY name',chosen);
    }
    const location=scope.venueId?db.get('SELECT address,city,region,postal_code AS postalCode,country,updated_at AS updatedAt FROM venue_locations WHERE venue_id=?',scope.venueId)||null:null;
    return json(res,200,{scope:scope.scope,venues,tvs,worlds:WORLDS,location,canEditLocation:scope.scope==='venue'&&scope.role!=='viewer'});
  }
  const filter=selection(ctx,scope),{where,args,from,to,asOf,limit,offset}=filter;
  if(path.endsWith('/events')) {
    // Ascending keyset pages + an asOf boundary let an operator export raw history without duplicates.
    let cursorWhere='',cursorArgs=[];
    const cursor=ctx.url.searchParams.get('cursor');
    if(cursor) {
      let value;try{value=JSON.parse(Buffer.from(cursor,'base64url').toString());}catch{fail(400,'Invalid event cursor.');}
      if(!Array.isArray(value)||value.length!==2||!Number.isSafeInteger(value[0])||typeof value[1]!=='string'||value[1].length>80)fail(400,'Invalid event cursor.');
      cursorWhere=' AND (e.occurred_at>? OR (e.occurred_at=? AND e.id>?))';cursorArgs=[value[0],value[0],value[1]];
    }
    const raw=db.all(`SELECT e.id AS eventId,e.playback_id AS playbackId,e.manifest_id AS manifestId,e.tv_id AS tvId,t.venue_id AS venueId,
      e.content_id AS contentId,e.campaign_id AS campaignId,COALESCE(p.title,c.title) AS title,p.world,
      COALESCE(p.venue_name,v.name) AS venueName,COALESCE(p.tv_name,t.name) AS tvName,p.location,
      e.kind,e.seconds,e.delivery_source AS source,e.sequence,e.occurred_at AS occurredAt,e.received_at AS receivedAt
      ${FROM} WHERE ${where}${cursorWhere} ORDER BY e.occurred_at,e.id LIMIT ?`,...args,...cursorArgs,limit+1);
    const more=raw.length>limit,rows=raw.slice(0,limit).map(r=>({...r,location:safeLocation(r.location,scope.scope==='brand')}));
    const last=rows.at(-1);
    return json(res,200,{scope:scope.scope,from,to,asOf,rows,nextCursor:more?Buffer.from(JSON.stringify([last.occurredAt,last.eventId])).toString('base64url'):null});
  }
  const grouped=`SELECT ${GROUP_COLUMNS} ${FROM} WHERE ${where} GROUP BY e.tv_id,e.playback_id,e.manifest_id,e.content_id,e.campaign_id`;
  const summary=db.get(`SELECT COUNT(*) AS recordedPlays,COALESCE(SUM(reportedSeconds>0),0) AS playsWithProgress,
    COUNT(DISTINCT tvId) AS screens,COUNT(DISTINCT venueId) AS venues,ROUND(COALESCE(SUM(reportedSeconds),0),3) AS reportedSeconds,
    COALESCE(SUM(completions>0),0) AS ended,COALESCE(SUM(skips>0),0) AS skipped,COALESCE(SUM(errors),0) AS errors,
    COALESCE(SUM(eventCount),0) AS events,COALESCE(SUM(delayedEvents),0) AS delayedEvents,MAX(lastReceivedAt) AS lastReceivedAt,
    COALESCE(SUM(metadataSnapshot=0),0) AS legacyRows FROM (${grouped})`,...args);
  const rows=db.all(`${grouped} ORDER BY firstEventAt DESC,e.tv_id,e.playback_id LIMIT ? OFFSET ?`,...args,limit,offset)
    .map(row=>({...row,location:safeLocation(row.location,scope.scope==='brand'),outcome:outcome(row)}));
  const geography=db.all(`SELECT json_extract(location,'$.city') AS city,json_extract(location,'$.region') AS region,
    json_extract(location,'$.country') AS country,COUNT(DISTINCT venueId) AS venues,COUNT(DISTINCT tvId) AS screens,
    ROUND(SUM(reportedSeconds),3) AS reportedSeconds FROM (${grouped}) GROUP BY city,region,country ORDER BY reportedSeconds DESC LIMIT 25`,...args);
  return json(res,200,{scope:scope.scope,from,to,asOf,limit,offset,total:summary.recordedPlays,hasMore:offset+rows.length<summary.recordedPlays,
    summary,rows,geography,audienceDwell:null,measurement:'Device-reported playback, not human views or measured audience dwell.',
    boundaries:{time:'UTC, start inclusive and end exclusive. Seconds are assigned to the progress-event timestamp.',
      location:'Venue-provided location captured in the issued manifest, not GPS or proof of device presence.',
      legacy:'Older records without snapshots use current names and have unknown historical location.',
      source:'Cache/network indicates playback source, not billable CDN bytes.',
      delay:'Offline reports appear after reconnect. Silence does not prove the TV was off.'}});
}
