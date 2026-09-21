/** Curators own publication; venues receive only the published selection. */
export async function environmentRoutes(c){
  const {req,res,path,method,b,db,json,admin,transaction,audit,id,now,parse,DEFAULT_MIX,
    text,choice,integer,fail,mixDefinition,THEMES,getVenue,manifest}=c;
  if(!path.startsWith('/api/admin/environments'))return;
  const user=admin(req);
  const decode=x=>({...x,mix:parse(x.mix,DEFAULT_MIX),playbackMode:x.playback_mode,
    blockedBrands:parse(x.blocked_brands,[]),showQr:!!x.show_qr,showVenuePromotions:!!x.show_venue_promotions});
  function definition(){
    const playbackMode=choice(b.playbackMode||'full',['full','no-ads','clean'],'playback mode');
    if(b.blockedBrands!==undefined&&(!Array.isArray(b.blockedBrands)||b.blockedBrands.length>100))fail(400,'Use at most 100 blocked brands.');
    return {name:text(b.name,'Environment name',80),description:text(b.description,'Description',240,true),
      mix:mixDefinition(b.mix),theme:choice(b.theme||'modern-luxury',THEMES.map(t=>t.id),'theme'),
      accent:text(b.accent||'#c7aa77','Accent',20),playbackMode,
      showQr:playbackMode!=='clean'&&b.showQr!==false,showVenuePromotions:playbackMode!=='clean'&&b.showVenuePromotions!==false,
      blockedBrands:[...new Set((b.blockedBrands||[]).map(x=>text(x,'Brand',80)))]};
  }
  const values=d=>[d.name,d.description,JSON.stringify(d.mix),d.theme,d.accent,d.playbackMode,
    Number(d.showQr),Number(d.showVenuePromotions),JSON.stringify(d.blockedBrands)];
  if(method==='GET'&&path==='/api/admin/environments')return json(res,200,{environments:db.all('SELECT * FROM curated_environments ORDER BY updated_at DESC,id').map(decode)});
  if(method==='POST'&&path==='/api/admin/environments/preview'){
    const d=definition(),venue=getVenue(text(b.venueId,'Preview venue',80));
    // Use the same eligible rotation, campaign and promotion policy as a player.
    // A preview has no TV assignment, schedule override, manifest or QR writes.
    return json(res,200,manifest({id:null,name:'Curator preview'},venue,{...d,
      savedMixxId:null,savedMixxName:null,environmentId:null,environmentName:d.name,environmentVersion:null}));
  }
  if(method==='POST'&&path==='/api/admin/environments'){
    const d=definition(),environmentId=id(),created=now();
    transaction(()=>{
      db.run('INSERT INTO curated_environments(id,name,description,mix,theme,accent,playback_mode,show_qr,show_venue_promotions,blocked_brands,status,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',environmentId,...values(d),'draft',1,created,created);
      audit(user.id,null,'environment.created',{environmentId,version:1});
    });
    return json(res,201,{ok:true,id:environmentId,status:'draft',version:1});
  }
  const match=/^\/api\/admin\/environments\/([^/]+)(?:\/(publish|withdraw))?$/.exec(path);
  if(!match||!((method==='PATCH'&&!match[2])||(method==='POST'&&match[2])))return;
  const environmentId=match[1],action=match[2];
  // Edits always require a version. Existing publication clients may omit it;
  // they publish the current stored definition rather than a stale payload.
  const expected=b.expectedVersion===undefined&&action?null:integer(b.expectedVersion,'Environment version',1,Number.MAX_SAFE_INTEGER);
  const d=method==='PATCH'?definition():null;
  const result=transaction(()=>{
    const existing=db.get('SELECT * FROM curated_environments WHERE id=?',environmentId);
    if(!existing)fail(404,'Environment not found.');
    if(expected!==null&&existing.version!==expected)fail(409,'This environment changed. Reopen it before saving.');
    if(d&&existing.status==='published'&&b.publish!==true)fail(409,'Use Publish update to change a live environment.');
    const status=action==='withdraw'?'withdrawn':action==='publish'||b.publish===true?'published':existing.status;
    const version=existing.version+1;
    if(d)db.run('UPDATE curated_environments SET name=?,description=?,mix=?,theme=?,accent=?,playback_mode=?,show_qr=?,show_venue_promotions=?,blocked_brands=?,status=?,version=?,updated_at=? WHERE id=?',...values(d),status,version,now(),environmentId);
    else db.run('UPDATE curated_environments SET status=?,version=?,updated_at=? WHERE id=?',status,version,now(),environmentId);
    audit(user.id,null,'environment.'+(status==='published'?'published':action==='withdraw'?'withdrawn':'updated'),{environmentId,version,previousVersion:existing.version});
    return {ok:true,id:environmentId,status,version};
  });
  return json(res,200,result);
}
