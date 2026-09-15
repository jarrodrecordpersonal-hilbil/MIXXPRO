import {authRoutes} from './routes/auth.mjs';
import {playerRoutes} from './routes/player.mjs';
import {venueRoutes} from './routes/venue.mjs';
import {billingRoutes} from './routes/billing.mjs';
import {publicRoutes} from './routes/public.mjs';
import {adminRoutes} from './routes/admin.mjs';
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync,createReadStream} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import {isIP} from 'node:net';
import {openDatabase} from './db.mjs';
import {token,hash,mac,equal,passwordHash,verifyPassword,verifyHook,rateLimit} from './security.mjs';
import {WORLDS,THEMES,fail,text,integer,choice,mixDefinition,rotation,entitled,hardwareEligible,activeSchedule,commission} from '../../packages/domain/src/runtime.mjs';
import {bunnyUrl,bunnyList,bunnyVideo,r2UploadUrl,stripe,destinationUrl} from './integrations.mjs';
import {qrSvg} from './qr.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const parse=(v,fallback={})=>{try{return JSON.parse(v);}catch{return fallback;}};
const now=()=>Date.now();
const id=()=>crypto.randomUUID();
const types=['golf','bourbon-bar','cigar','steakhouse','other'];
const DEFAULT_MIX={mode:'single',worlds:{golf:'normal'},subcategories:{},minutes:180,seed:1};
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function configuration(env=process.env){
  const c={...env,APP_ORIGIN:env.APP_ORIGIN||'http://localhost:3000',DB_PATH:env.DB_PATH||resolve(ROOT,'data/mixxpro.sqlite'),DEMO_MODE:env.DEMO_MODE==='true',PRODUCTION:env.NODE_ENV==='production',SIGNUPS_ENABLED:env.SIGNUPS_ENABLED==='true'||(env.NODE_ENV!=='production'&&env.SIGNUPS_ENABLED!=='false'),FREE_TV_LIMIT:Number(env.FREE_TV_LIMIT||5),COMMISSION_BPS:Number(env.COMMISSION_BPS||0)};
  if(c.PRODUCTION&&(!c.APP_SECRET||c.APP_SECRET.length<32||!c.APP_ORIGIN.startsWith('https://')||c.DEMO_MODE))throw Error('Production requires HTTPS APP_ORIGIN, APP_SECRET (32+ characters), and DEMO_MODE=false.');
  if(c.BUNNY_CDN_HOST&&!/^[a-z0-9.-]+$/i.test(c.BUNNY_CDN_HOST))throw Error('BUNNY_CDN_HOST must be a hostname without a scheme or path.');
  integer(c.FREE_TV_LIMIT,'Free TV allowance',1,100);integer(c.COMMISSION_BPS,'Commission rate',0,10000);
  c.APP_SECRET ||=token(32);return c;
}
export function createApplication(options={}){
  const config=options.config||configuration(),db=options.db||openDatabase(config.DB_PATH);
  const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  const audit=(actor,venue,action,detail={})=>db.run('INSERT INTO audit VALUES(?,?,?,?,?,?)',id(),actor,venue,action,JSON.stringify(detail),now());
  const transaction=fn=>db.transaction(fn);
  const getVenue=(venueId)=>{const v=db.get('SELECT * FROM venues WHERE id=?',venueId);if(!v)fail(404,'Venue not found.');return {...v,mix:parse(v.mix,DEFAULT_MIX)};};
  const schedulesFor=v=>db.all('SELECT * FROM schedules WHERE venue_id=? ORDER BY created_at DESC',v).map(s=>({...s,days:parse(s.days,[]),tv_ids:parse(s.tv_ids,[]),mix:parse(s.mix)}));
  const tvRows=v=>db.all('SELECT id,venue_id,name,group_name,rotation_seed,revoked,mix,theme,last_seen,cache_seconds,cache_bytes,playing,current_title,last_ack,created_at FROM tvs WHERE venue_id=? AND revoked=0 ORDER BY created_at,id',v).map(t=>({...t,mix:t.mix?parse(t.mix):null,online:!!t.last_seen&&now()-t.last_seen<45000}));
  function readSession(req){
    const value=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('mixx_session='))?.slice(13);
    if(!value)return null;
    return db.get('SELECT s.token_hash,s.csrf,s.expires_at,u.id,u.email,u.name,u.platform_role,u.brand_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',hash(value),now())||null;
  }
  function requireSession(req){const user=readSession(req);if(!user)fail(401,'Sign in to continue.');return user;}
  function access(req,write=false){
    const user=requireSession(req),venueId=req.headers['x-venue-id'];
    if(typeof venueId!=='string')fail(400,'Select a venue.');
    const member=db.get('SELECT role FROM members WHERE venue_id=? AND user_id=?',venueId,user.id);
    if(!member)fail(404,'Venue not found.');if(write&&member.role==='viewer')fail(403,'Your venue role is read-only.');
    return {user,venue:getVenue(venueId),role:member.role};
  }
  function admin(req){const u=requireSession(req);if(u.platform_role!=='admin')fail(403,'Administrator access required.');return u;}
  function device(req){
    const bearer=req.headers.authorization?.replace(/^Bearer /,'');if(!bearer)fail(401,'Pair this TV first.');
    const t=db.get('SELECT * FROM tvs WHERE token_hash=? AND revoked=0',hash(bearer));if(!t)fail(401,'TV access has been revoked.');
    const v=getVenue(t.venue_id),allowed=tvRows(v.id).slice(0,v.plan==='free'?config.FREE_TV_LIMIT:v.seats);
    if(!allowed.some(x=>x.id===t.id))fail(403,'This TV needs an available subscription seat.');
    return {tv:t,venue:v};
  }
  function issueSession(res,userId){
    const secret=token(32),csrf=token();db.run('DELETE FROM sessions WHERE expires_at<?',now());
    db.run('INSERT INTO sessions VALUES(?,?,?,?)',hash(secret),userId,csrf,now()+7*86400000);
    res.setHeader('Set-Cookie',`mixx_session=${secret}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${config.PRODUCTION?'; Secure':''}`);return csrf;
  }
  function createVenue(userId,b){
    const name=text(b.name,'Venue name',80),type=choice(b.type,types,'venue type'),timezone=text(b.timezone||'America/Chicago','Timezone',60);
    try{new Intl.DateTimeFormat('en-US',{timeZone:timezone}).format();}catch{fail(400,'Choose a valid timezone.');}
    const venueId=id(),ref=b.referral_code?db.get('SELECT id FROM venues WHERE referral_code=?',text(b.referral_code,'Referral code',30)):null;
    db.run('INSERT INTO venues(id,name,type,timezone,seats,mix,qr_code,referral_code,referred_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',venueId,name,type,timezone,config.FREE_TV_LIMIT,JSON.stringify(DEFAULT_MIX),token(9),token(6).toUpperCase(),ref?.id||null,now());
    db.run('INSERT INTO members VALUES(?,?,?)',venueId,userId,'owner');return getVenue(venueId);
  }
  function enqueue(tv,kind,payload={}){db.run('INSERT INTO commands(tv_id,kind,payload,created_at,expires_at) VALUES(?,?,?,?,?)',tv,kind,JSON.stringify(payload),now(),now()+300000);}
  function summarize(venueId){
    const since=now()-30*86400000;
    const seconds=db.get('SELECT COALESCE(SUM(e.seconds),0) value FROM events e JOIN tvs t ON t.id=e.tv_id WHERE t.venue_id=? AND e.occurred_at>?',venueId,since).value;
    const scans=db.get('SELECT COUNT(*) value FROM scans WHERE venue_id=? AND created_at>?',venueId,since).value;
    const orders=db.get('SELECT COUNT(*) count,COALESCE(SUM(net_cents-refund_cents),0) cents FROM orders WHERE venue_id=? AND created_at>?',venueId,since);
    const balance=db.get('SELECT COALESCE(SUM(amount_cents),0) value FROM ledger WHERE venue_id=?',venueId).value;
    const earned=db.get("SELECT COALESCE(SUM(amount_cents),0) value FROM ledger WHERE venue_id=? AND kind!='payout' AND created_at>?",venueId,since).value;
    return {seconds,scans,orders:orders.count,salesCents:orders.cents,balanceCents:balance,earnedCents:earned,dwell:null};
  }
  function effective(tv,venue){const s=activeSchedule(schedulesFor(venue.id),tv.id,venue.timezone),mix=s?.mix||(tv.mix?parse(tv.mix):venue.mix);return {mix:{...mix,seed:((mix.seed||0)+(tv.rotation_seed||0))%2147483647},theme:s?.theme||tv.theme||venue.theme};}
  function manifest(tv,venue){
    const current=effective(tv,venue),catalog=db.all('SELECT * FROM content').map(c=>({...c,worlds:parse(c.worlds,[]),tags:parse(c.tags,[])}));
    const window=Math.floor(now()/(current.mix.minutes*60000));
    const candidates=db.all('SELECT * FROM campaigns WHERE active=1 AND starts_at<=? AND ends_at>?',now(),now());
    const fingerprint=hash(JSON.stringify([current,venue.plan,venue.accent,catalog,candidates,window]));
    const prior=db.get('SELECT payload FROM manifests WHERE tv_id=? AND expires_at>? ORDER BY created_at DESC LIMIT 1',tv.id,now()+300000);
    if(prior){const saved=parse(prior.payload);if(saved.fingerprint===fingerprint)return saved;}
    let queue=rotation(catalog,{...current.mix,seed:(current.mix.seed+window)%2147483647},venue.plan);
    if(!config.DEMO_MODE)queue=queue.filter(c=>c.provider!=='demo');
    const campaigns=candidates.filter(c=>(!c.venue_type||c.venue_type===venue.type)&&Object.keys(current.mix.worlds).includes(c.world));
    if(venue.plan==='free'&&campaigns.length){
      let elapsed=0,lastAd=0,next=0,withAds=[];
      for(const c of queue){withAds.push(c);elapsed+=c.playSeconds;if(elapsed-lastAd>=600){const campaign=campaigns[next++%campaigns.length],ad=catalog.find(a=>a.id===campaign.content_id&&a.sponsor&&entitled(a,venue.plan));if(ad){withAds.push({...ad,world:campaign.world,campaignId:campaign.id,playSeconds:ad.duration});elapsed+=ad.duration;lastAd=elapsed;}}}
      let remain=current.mix.minutes*60;queue=withAds.flatMap(c=>{if(remain<=0)return [];const playSeconds=Math.min(c.playSeconds,remain);remain-=playSeconds;return [{...c,playSeconds}];});
    }
    const manifestId=id(),created=now(),expires=Math.min(created+6*3600000,...queue.map(c=>Math.min(c.rights_until||Infinity,c.campaignId?(campaigns.find(a=>a.id===c.campaignId)?.ends_at||Infinity):Infinity)));
    const publicItems=queue.map((c,index)=>({index,contentId:c.id,campaignId:c.campaignId||null,title:c.title,world:c.world,duration:c.duration,playSeconds:c.playSeconds,cacheKey:`${c.provider}:${c.asset_id}:${c.resolution}`,url:c.provider==='demo'?'/demo/sample.mp4':bunnyUrl(c.asset_id,c.resolution,config,Math.floor(expires/1000)),demo:c.provider==='demo'}));
    const result={id:manifestId,fingerprint,tvId:tv.id,venueName:venue.name,theme:current.theme,accent:venue.accent,mix:current.mix,createdAt:created,expiresAt:expires,items:publicItems};
    transaction(()=>{
      db.run('INSERT INTO manifests VALUES(?,?,?,?,?)',manifestId,tv.id,JSON.stringify(result),expires,created);
      const codes=new Map();for(const item of publicItems){const key=`${item.contentId}:${item.campaignId}`;if(!codes.has(key)){const code=token(9);db.run('INSERT INTO qr_links VALUES(?,?,?,?,?,?,?)',code,venue.id,tv.id,item.contentId,item.campaignId,manifestId,expires);codes.set(key,code);}item.qrUrl=`${config.APP_ORIGIN}/r/${codes.get(key)}`;item.qrImage=`/qr/${codes.get(key)}.svg`;}
      db.run('UPDATE manifests SET payload=? WHERE id=?',JSON.stringify(result),manifestId);
    });return result;
  }
  async function body(req){let chunks=[],length=0;for await(const chunk of req){length+=chunk.length;if(length>1048576)fail(413,'Request is too large.');chunks.push(chunk);}return Buffer.concat(chunks).toString('utf8');}
  async function handler(req,res){
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: https:; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'");
    if(config.PRODUCTION)res.setHeader('Strict-Transport-Security','max-age=31536000');
    try{
      const url=new URL(req.url,'http://local'),path=url.pathname,method=req.method;
      const forwarded=req.headers['x-real-ip'];
      const ip=config.TRUST_PROXY==='true'&&typeof forwarded==='string'&&isIP(forwarded)?forwarded:(req.socket.remoteAddress||'unknown');
      if(path.startsWith('/api/'))rateLimit(db,`general:${ip}`,6000,60000);
      const mutation=['POST','PATCH','DELETE','PUT'].includes(method);
      if(mutation&&!path.startsWith('/api/hooks/')){
        if(req.headers.origin&&req.headers.origin!==config.APP_ORIGIN)fail(403,'Request origin was not allowed.');
        if(path.startsWith('/api/')&&!String(req.headers['content-type']||'').startsWith('application/json'))fail(415,'Send JSON.');
        const session=readSession(req);
        if(session&&!path.startsWith('/api/player/')&&!path.startsWith('/api/auth/')&&!path.startsWith('/api/public/')&&!equal(req.headers['x-csrf-token'],session.csrf))fail(403,'Refresh the page before making this change.');
      }
      let raw='',b={};if(mutation){raw=await body(req);try{b=raw?JSON.parse(raw):{};}catch{fail(400,'Invalid JSON.');}if(!b||typeof b!=='object'||Array.isArray(b))fail(400,'Expected a JSON object.');}
      const context={req,res,path,method,url,ip,b,raw,db,config,json,audit,transaction,readSession,requireSession,access,admin,device,getVenue,schedulesFor,tvRows,issueSession,createVenue,enqueue,summarize,effective,manifest,billing,id,now,types,DEFAULT_MIX,parse,escape,token,hash,mac,equal,passwordHash,verifyPassword,verifyHook,rateLimit,fail,text,integer,choice,mixDefinition,WORLDS,THEMES,hardwareEligible,commission,bunnyUrl,bunnyList,bunnyVideo,r2UploadUrl,destinationUrl,qrSvg};
      for(const route of [authRoutes,playerRoutes,venueRoutes,billingRoutes,publicRoutes,adminRoutes]){await route(context);if(res.writableEnded)return;}
      if(path.startsWith('/api/'))fail(404,'API route not found.');
      if(method!=='GET'&&method!=='HEAD')fail(405,'Method not allowed.');
      if(path==='/demo/sample.mp4'){
        if(!config.DEMO_MODE)fail(404,'Not found.');const file=resolve(ROOT,'tests/fixtures/sample.mp4');if(!existsSync(file))fail(404,'Demo fixture is missing.');
        const size=statSync(file).size;let start=0,end=size-1,status=200;const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
        if(match){start=Number(match[1]);end=match[2]?Number(match[2]):end;if(start>end||end>=size){res.writeHead(416,{'Content-Range':`bytes */${size}`});return res.end();}status=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${size}`);}
        res.writeHead(status,{'Content-Type':'video/mp4','Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'private, max-age=60'});if(method==='HEAD')return res.end();return createReadStream(file,{start,end}).pipe(res);
      }
      const files={'/app.mjs':'apps/web/public/app.mjs','/style.css':'apps/web/public/style.css','/player/player.mjs':'apps/player/public/player.mjs','/player/offline.mjs':'apps/player/public/offline.mjs','/player/sw.js':'apps/player/public/sw.js','/player/manifest.webmanifest':'apps/player/public/manifest.webmanifest','/shared/domain.mjs':'packages/domain/src/runtime.mjs','/icon.svg':'apps/web/public/icon.svg','/public.mjs':'apps/web/public/public.mjs'};
      const file=files[path]||(path==='/player'||path==='/player/'?'apps/player/public/index.html':/^\/r\/[A-Za-z0-9_-]+$/.test(path)?'apps/web/public/public.html':path==='/'||['/mixx','/tvs','/themes','/revenue','/admin','/brands','/billing','/schedule','/commerce'].includes(path)?'apps/web/public/index.html':null);
      if(!file)fail(404,'Page not found.');
      const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
      res.writeHead(200,{'Content-Type':mime[extname(file)]||'text/plain','Cache-Control':'no-cache'});return res.end(method==='HEAD'?'':readFileSync(resolve(ROOT,file)));
    }catch(e){
      if(res.headersSent){res.end();return;}
      if(!e.status)console.error('Request failed:',e.message);
      return json(res,e.status||500,{error:e.status?e.message:'Something went wrong. Please try again.',requestId:id()});
    }
  }
  const billing=options.stripe||stripe;
  const server=createServer(handler);server.requestTimeout=30000;server.headersTimeout=15000;server.maxHeadersCount=60;
  return {server,db,config,close:()=>new Promise(resolve=>server.close(()=>{db.close();resolve();}))};
}
