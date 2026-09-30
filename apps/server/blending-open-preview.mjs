/**
 * No-login build sandbox. Never opens DB_PATH or forwards to the normal service.
 * Only the explicitly listed blending/player routes reach a disposable in-memory
 * application. Unrelated admin, identity, venue, billing and provider APIs are denied.
 */
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {createApplication, configuration} from './app.mjs';
import {seedBlendingPreview} from './blending-preview-seed.mjs';

const TOKEN = '[A-Za-z0-9_-]+';
const readPaths = [
  /^\/blending\/?$/, new RegExp(`^/blending/${TOKEN}$`),
  /^\/(?:blending|games)\.(?:mjs|css)$/, /^\/(?:icon|bourbon-games-logo|mixxplay-logo)\.svg$/,
  new RegExp(`^/blending-qr/${TOKEN}\\.svg$`), new RegExp(`^/games/${TOKEN}$`),
  new RegExp(`^/api/public/blending(?:/${TOKEN})?$`), new RegExp(`^/api/public/games/${TOKEN}$`),
  new RegExp(`^/api/admin/blending/seasons/${TOKEN}$`), /^\/api\/blending\/judging$/
];
const writePaths = [
  new RegExp(`^/api/public/blending/${TOKEN}/entries(?:/${TOKEN})?$`),
  /^\/api\/admin\/blending\/seasons$/, new RegExp(`^/api/admin/blending/seasons/${TOKEN}/(?:configure|batches)$`),
  new RegExp(`^/api/admin/blending/batches/${TOKEN}/(?:configure|prepare|advance)$`),
  /^\/api\/blending\/judging\/score$/,
  new RegExp(`^/api/public/games/${TOKEN}/(?:join|predict|resume|link-device)$`)
];
export function createOpenBlendingPreview(env = process.env) {
  if (env.BLENDING_OPEN_PREVIEW !== 'true') throw Error('Open preview requires explicit BLENDING_OPEN_PREVIEW=true.');
  const origin = env.APP_ORIGIN || env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
  const parsed = new URL(origin);
  if (parsed.origin !== origin || parsed.username || parsed.password ||
      (parsed.protocol !== 'https:' && !(env.NODE_ENV !== 'production' && ['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))))
    throw Error('The hosted open preview requires an HTTPS APP_ORIGIN or RENDER_EXTERNAL_URL.');
  // Intentionally copy no credentials, disk paths or live integrations from env.
  const config = configuration({NODE_ENV:env.NODE_ENV === 'production' ? 'production' : 'test',
    APP_ORIGIN:origin, APP_SECRET:randomBytes(32).toString('hex'), DB_PATH:':memory:',
    DEMO_MODE:'false', SIGNUPS_ENABLED:'false', GAME_ACCOUNTS_ENABLED:'true', BLENDING_GAMES_ENABLED:'true', COMMISSION_BPS:'0'});
  let active = 0, generation = 0, lastReset = 0;
  function fresh() {
    const app = createApplication({config});
    const seed = app.db.transaction(() => seedBlendingPreview(app.db));
    generation++;
    return {app,seed};
  }
  let current = fresh();
  const json = (res,status,value) => {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  const server = createServer((req,res) => {
    res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Cache-Control','no-store');
    if(config.PRODUCTION)res.setHeader('Strict-Transport-Security','max-age=31536000');
    let path;
    try {path = new URL(req.url,'http://preview.invalid').pathname;} catch {return json(res,400,{error:'Invalid URL.'});}
    if (req.method === 'GET' && path === '/api/health') return json(res,200,{ok:true,openPreview:true});
    if (req.method === 'GET' && path === '/robots.txt') {res.writeHead(200,{'Content-Type':'text/plain'});return res.end('User-agent: *\nDisallow: /\n');}
    if (['GET','HEAD'].includes(req.method) && ['/', '/play','/play/'].includes(path)) {
      res.writeHead(302,{Location:'/blending/'+current.seed.code});return res.end();
    }
    if (req.method === 'GET' && path === '/api/open-preview') return json(res,200,{
      enabled:true,shared:true,generation,csrf:current.seed.csrf,code:current.seed.code,
      judges:current.seed.judges.map(j=>({key:j.key,name:j.name})),
      message:'Open build preview. Shared fictional data. Anyone can try judge and producer controls. Resets on restart. Do not enter real personal details or recipes.'
    });
    if (req.method === 'POST') {
      if (req.headers.origin !== config.APP_ORIGIN || !String(req.headers['content-type']||'').startsWith('application/json'))
        return json(res,403,{error:'Use this preview page to make changes.'});
      if (path.startsWith('/api/open-preview/')) {
        if (req.headers['x-csrf-token'] !== current.seed.csrf) return json(res,403,{error:'Refresh the preview before changing it.'});
        req.resume();
        if (path === '/api/open-preview/reset') {
          if (active || Date.now()-lastReset < 5000) return json(res,409,{error:'Another preview action is finishing. Try resetting again in a few seconds.'});
          const previous = current;
          current = fresh(); previous.app.db.close();lastReset=Date.now();
          return json(res,200,{ok:true,generation});
        }
        if (path === '/api/open-preview/lock-scores') {
          // Does not edit locked cards. Locks the current drafts in this disposable
          // preview only; normal scoring endpoints/triggers remain unchanged.
          const db=current.app.db;
          const result=db.run('UPDATE blend_scorecards SET locked_at=?,revision=revision+1 WHERE locked_at IS NULL',Date.now());
          return json(res,200,{ok:true,locked:result.changes});
        }
        return json(res,404,{error:'Preview action not found.'});
      }
    }
    const allowed = ['GET','HEAD'].includes(req.method) ? readPaths.some(r=>r.test(path)) : req.method==='POST' && writePaths.some(r=>r.test(path));
    if (!allowed) return json(res,404,{error:'Not part of the open build preview. Live accounts, venue admin and integrations are not available here.'});
    const {app,seed}=current;
    // Only guest-player credentials are honored from the external browser.
    req.headers.cookie = (req.headers.cookie||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith('mixx_game=')).join('; ');
    delete req.headers.authorization;delete req.headers['x-venue-id'];
    if (!path.startsWith('/api/public/games/')) {
      const judge = seed.judges.find(j=>j.key===String(req.headers['x-preview-judge']||'1'));
      if (path.startsWith('/api/blending/judging') && !judge) return json(res,400,{error:'Choose one of the preview judges.'});
      const principal=path.startsWith('/api/blending/judging')?judge:seed.producer;
      req.headers.cookie = principal.cookie;
    }
    // Only presentation metadata changes. The actual player/scoring API is reused.
    const end=res.end;
    res.end=function(chunk,...args) {
      if (String(res.getHeader('Content-Type')||'').includes('application/json') && typeof chunk==='string') {
        try {
          const data=JSON.parse(chunk);
          data.openPreview=true;
          if (path.startsWith('/api/public/games/') && data.account) data.account.enabled=false;
          chunk=JSON.stringify(data);
        } catch {}
      }
      return end.call(this,chunk,...args);
    };
    active++;
    let finished=false;
    const done=()=>{if(!finished){finished=true;active--;}};
    res.once('finish',done);res.once('close',done);
    app.server.emit('request',req,res);
  });
  server.requestTimeout=30000;server.headersTimeout=15000;server.maxHeadersCount=60;
  return {server,config,close:()=>new Promise(resolve=>server.close(()=>{current.app.db.close();resolve();}))};
}
