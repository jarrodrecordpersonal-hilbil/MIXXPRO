/** Read-only provider diagnostics. No uploads, secret echoes or account mutations. */
import {bunnyUrl} from './integrations.mjs';
const FIELDS=['BUNNY_LIBRARY_ID','BUNNY_API_KEY','BUNNY_CDN_HOST','BUNNY_TOKEN_KEY'];
const check=(id,status,label,detail)=>({id,status,label,detail});
async function boundedJson(response){
  const reader=response.body.getReader();let size=0,parts=[];
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>1048576)throw Error('oversized');parts.push(value);}}
  finally{await reader.cancel().catch(()=>{});}
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
export async function checkBunny(config,{fetchFn=fetch,resolution=720,now=Date.now()}={}){
  const checks=[];const result=()=>({checkedAt:new Date(now).toISOString(),checks,
    readyForPlayerTest:checks.some(c=>c.id==='mp4'&&c.status==='pass')&&!checks.some(c=>c.status!=='pass'),
    actualPlaybackTested:false,accountChanged:false});
  const missing=FIELDS.filter(k=>typeof config[k]!=='string'||!config[k].trim());
  if(missing.length){checks.push(check('configuration','pending','Private connection settings','Add these to the running app environment: '+missing.join(', ')+'. Do not paste keys into chat or GitHub.'));return result();}
  const host=config.BUNNY_CDN_HOST;
  if(!/^\d+$/.test(config.BUNNY_LIBRARY_ID)||!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(host)||host.endsWith('.local')||host.endsWith('.localhost')){
    checks.push(check('configuration','fail','Connection format','Use a numeric Library ID and a public CDN hostname without a scheme, port or path.'));return result();
  }
  if(![360,480,720,1080].includes(resolution)){checks.push(check('configuration','fail','Video resolution','Choose 360p, 480p, 720p or 1080p.'));return result();}
  let origin;try{const u=new URL(config.APP_ORIGIN);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error();origin=u.origin;}catch{
    checks.push(check('configuration','fail','App origin','Configure APP_ORIGIN as the app origin without credentials, a path or a query.'));return result();
  }
  checks.push(check('configuration','pass','Private connection settings','Required settings are present. Values are never included in this report.'));
  const request=(url,options={})=>fetchFn(url,{...options,redirect:'error',signal:AbortSignal.timeout(8000)});
  let library;
  try{
    const r=await request(`https://video.bunnycdn.com/library/${config.BUNNY_LIBRARY_ID}/videos?page=1&itemsPerPage=100`,{headers:{AccessKey:config.BUNNY_API_KEY}});
    if(!r.ok){await r.body?.cancel().catch(()=>{});checks.push(check('library','fail','Bunny library access',[401,403].includes(r.status)?'Bunny rejected the library key. Use the Stream library API key, not the account-wide or embed key.':r.status===404?'Library not found. Check the Library ID and matching library key.':'Bunny did not return a successful library response. Check account status and try again.'));return result();}
    library=await boundedJson(r);if(!Array.isArray(library.items)||library.items.length>100)throw Error('unexpected-response');
  }catch{checks.push(check('library','fail','Bunny library access','The library could not be read safely. Check connectivity and provider configuration, then retry.'));return result();}
  checks.push(check('library','pass','Bunny library access',`Read ${library.items.length} videos from the first library page. No videos were uploaded, published or changed.`));
  const video=library.items.find(v=>v&&v.status===4&&typeof v.guid==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(v.guid));
  if(!video){checks.push(check('mp4','pending','Encoded video',library.items.length?'No finished video was found on the first 100-item page. Wait for encoding or test a library page containing a finished video.':'Library access works. Enable MP4 Fallback, then upload one video you own.'));return result();}
  let signed;
  try{
    const url=bunnyUrl(video.guid,resolution,config,Math.floor(now/1000)+300);
    signed=await request(url,{method:'HEAD',headers:{Origin:origin}});
  }catch{checks.push(check('mp4','fail','Protected MP4 access','The MP4 could not be reached. Check the CDN hostname, direct-file token key and network.'));return result();}
  if(!signed.ok){checks.push(check('mp4','fail',`${resolution}p MP4 access`,[401,403].includes(signed.status)?'The CDN rejected the signed file. Check the Pull Zone token key and security rules.':'The selected MP4 was not available. Enable MP4 Fallback before uploading and choose an existing resolution.'));return result();}
  const type=signed.headers.get('content-type')||'';
  if(!/^(video\/mp4|application\/octet-stream)(;|$)/i.test(type)){checks.push(check('mp4','fail','MP4 response','The endpoint did not identify its response as MP4/video data. A successful web page is not a video.'));return result();}
  checks.push(check('mp4','pass',`${resolution}p protected MP4`,'The signed HEAD request succeeded. No full video was downloaded; decoding is not yet tested.'));
  const cors=signed.headers.get('access-control-allow-origin');
  checks.push(check('cors',cors===origin||cors==='*'?'pass':'fail','Browser download permission',cors===origin||cors==='*'?'The response permits this origin. A real browser GET/download test is still required.':'The response does not permit this app origin. Configure CDN CORS and retest.'));
  try{
    const r=await request(`https://${host}/${video.guid}/play_${resolution}p.mp4`,{method:'HEAD',headers:{Origin:origin}});
    checks.push(check('protection',[401,403].includes(r.status)?'pass':'fail','Unsigned-file protection',[401,403].includes(r.status)?'The unsigned request was rejected.':'Unsigned access was not confirmed blocked. Enable/check Pull Zone token authentication.'));
  }catch{checks.push(check('protection','pending','Unsigned-file protection','Protection could not be verified. Check CDN rules and retry.'));}
  return result();
}
