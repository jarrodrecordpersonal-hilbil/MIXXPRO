/** Branded HTML/assets. Competition API logic is unchanged in blending-core.mjs. */
import {rehearsalRoutes} from './rehearsal.mjs';
import {readFileSync} from 'node:fs';
import {blendingRoutes as coreRoutes} from './blending-core.mjs';
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://i.ytimg.com; frame-src https://www.youtube-nocookie.com; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'; object-src 'none'";
const files = new Map([
  ['/game-media.mjs',['game-media.mjs','text/javascript']], ['/game-media.css',['game-media.css','text/css']],
  ['/game-play.css',['game-play.css','text/css']], ['/game-day-polish.css',['game-day-polish.css','text/css']],
  ['/blending.css', ['blending.css','text/css']], ['/blending.mjs',['blending.mjs','text/javascript']],
  ['/bg-media/watch.css',['bg-media/watch.css','text/css']], ['/bg-media/watch.mjs',['bg-media/watch.mjs','text/javascript']],
  ['/bg-media/episodes.mjs',['bg-media/episodes.mjs','text/javascript']],
  ['/bg-media/mixx-tank.png',['bg-media/mixx-tank.png','image/png']], ['/bg-media/bourbon-games.png',['bg-media/bourbon-games.png','image/png']]
]);
export async function blendingRoutes(c) {
  if(await rehearsalRoutes(c))return;
  if (['GET','HEAD'].includes(c.method) && /^\/games\/[A-Za-z0-9_-]+$/.test(c.path)) c.res.setHeader('Content-Security-Policy',CSP);
  const page = c.path === '/blending' || c.path === '/blending/' || /^\/blending\/[A-Za-z0-9_-]+$/.test(c.path);
  if (['GET','HEAD'].includes(c.method) && (page || files.has(c.path))) {
    const [file, mime] = files.get(c.path) || ['blending.html','text/html'];
    c.res.setHeader('Content-Security-Policy',CSP);
    c.res.writeHead(200,{'Content-Type':mime+(mime.startsWith('text/')?'; charset=utf-8':''),'Cache-Control':'no-cache'});
    return c.res.end(c.method === 'HEAD' ? '' : readFileSync(new URL('../../web/public/'+file,import.meta.url)));
  }
  return coreRoutes(c);
}
