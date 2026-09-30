import {existsSync, readFileSync, statSync} from 'node:fs';
const ROOT=new URL('../../web/public/rehearsal/',import.meta.url);
const FILES=new Map([
 ['/rehearsal',['index.html','text/html; charset=utf-8']],['/rehearsal/',['index.html','text/html; charset=utf-8']],
 ['/rehearsal/player.mjs',['player.mjs','text/javascript; charset=utf-8']],['/rehearsal/engine.mjs',['engine.mjs','text/javascript; charset=utf-8']],
 ['/rehearsal/style.css',['style.css','text/css; charset=utf-8']],['/rehearsal/episode.json',['episode.json','application/json; charset=utf-8']],
 ['/rehearsal/episode.mp4',['episode.mp4','video/mp4']],['/rehearsal/poster.png',['poster.png','image/png']],
 ['/rehearsal/captions.vtt',['captions.vtt','text/vtt; charset=utf-8']],['/rehearsal/script.md',['script.md','text/plain; charset=utf-8']]
]);
export function byteRange(header,size){
 if(!header)return {start:0,end:size-1,status:200};
 const m=/^bytes=(\d*)-(\d*)$/.exec(header);
 if(!m||(!m[1]&&!m[2]))return null;
 if(m.slice(1).some(v=>v&&!Number.isSafeInteger(Number(v))))return null;
 let start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2]));
 let end=m[1]&&m[2]?Number(m[2]):size-1;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||!size||start>=size||start>end||(!m[1]&&Number(m[2])===0))return null;
 end=Math.min(end,size-1);
 return {start,end,status:206};
}
export async function rehearsalRoutes(c){
 if(!c.path.startsWith('/rehearsal'))return false;
 const asset=FILES.get(c.path);
 if(!asset||!c.config.BLENDING_GAMES_ENABLED){c.json(c.res,404,{error:'Practice page not found.'});return true;}
 if(!['GET','HEAD'].includes(c.method)){c.res.setHeader('Allow','GET, HEAD');c.json(c.res,405,{error:'Practice is local to this tab. There is no submission API.'});return true;}
 const [name,mime]=asset,file=new URL(name,ROOT);
 if(!existsSync(file)){c.json(c.res,503,{error:'Rehearsal media is not built yet. Run python scripts/build_rehearsal.py or deploy the current Docker image.'});return true;}
 c.res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self'; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'");
 const size=statSync(file).size,range=byteRange(name.endsWith('.mp4')?c.req.headers.range:null,size);
 if(!range){c.res.writeHead(416,{'Content-Range':`bytes */${size}`,'Accept-Ranges':'bytes'});c.res.end();return true;}
 const headers={'Content-Type':mime,'Content-Length':range.end-range.start+1,'Cache-Control':'no-cache'};
 if(name.endsWith('.mp4'))headers['Accept-Ranges']='bytes';
 if(range.status===206)headers['Content-Range']=`bytes ${range.start}-${range.end}/${size}`;
 c.res.writeHead(range.status,headers);
 // This short rehearsal is a small local file; no external URL or path is accepted.
 c.res.end(c.method==='HEAD'?'':readFileSync(file).subarray(range.start,range.end+1));return true;
}
