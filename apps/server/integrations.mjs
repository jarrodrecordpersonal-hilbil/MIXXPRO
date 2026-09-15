import {createHash,createHmac} from 'node:crypto';
import {fail} from '../../packages/domain/src/runtime.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
const hmac=(key,s,encoding)=>createHmac('sha256',key).update(s).digest(encoding);
const enc=s=>encodeURIComponent(s).replace(/[!'()*]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`);
/** Bunny advanced (HS256) exact-file CDN token, not an iframe/embed token. */
export function bunnyUrl(assetId,resolution,config,expires){
  if(!config.BUNNY_CDN_HOST||!config.BUNNY_TOKEN_KEY)fail(503,'Bunny CDN credentials are not configured.');
  if(!/^[a-zA-Z0-9-]+$/.test(assetId)||![360,480,720,1080].includes(resolution))fail(400,'Invalid media asset.');
  const path=`/${assetId}/play_${resolution}p.mp4`;
  const signature=hmac(config.BUNNY_TOKEN_KEY,path+expires,'base64url');
  return `https://${config.BUNNY_CDN_HOST}${path}?token=HS256-${signature}&expires=${expires}`;
}
/** S3 Signature V4 presigned PUT. Restrict CORS on the private R2 bucket. */
export function r2UploadUrl(key,contentType,config,now=new Date()){
  for(const k of ['R2_ACCOUNT_ID','R2_BUCKET','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY'])if(!config[k])fail(503,'R2 credentials are not configured.');
  const host=`${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const stamp=now.toISOString().replace(/[:-]|\.\d{3}/g,'');const day=stamp.slice(0,8),scope=`${day}/auto/s3/aws4_request`;
  const path='/'+[config.R2_BUCKET,...key.split('/')].map(enc).join('/');
  const query={'X-Amz-Algorithm':'AWS4-HMAC-SHA256','X-Amz-Credential':`${config.R2_ACCESS_KEY_ID}/${scope}`,'X-Amz-Date':stamp,'X-Amz-Expires':'900','X-Amz-SignedHeaders':'content-type;host'};
  const qs=Object.entries(query).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${enc(k)}=${enc(v)}`).join('&');
  const canonical=['PUT',path,qs,`content-type:${contentType}\nhost:${host}\n`,'content-type;host','UNSIGNED-PAYLOAD'].join('\n');
  const signingKey=hmac(hmac(hmac(hmac('AWS4'+config.R2_SECRET_ACCESS_KEY,day),'auto'),'s3'),'aws4_request');
  const signature=hmac(signingKey,`AWS4-HMAC-SHA256\n${stamp}\n${scope}\n${sha(canonical)}`,'hex');
  return {url:`https://${host}${path}?${qs}&X-Amz-Signature=${signature}`,key,headers:{'Content-Type':contentType},expiresAt:now.getTime()+900000};
}
export async function bunnyList(config,page=1){
  if(!config.BUNNY_LIBRARY_ID||!config.BUNNY_API_KEY)fail(503,'Bunny Stream is not connected yet.');
  return request(`https://video.bunnycdn.com/library/${config.BUNNY_LIBRARY_ID}/videos?page=${page}&itemsPerPage=100`,{headers:{AccessKey:config.BUNNY_API_KEY}});
}
export async function bunnyVideo(config,id){
  if(!config.BUNNY_LIBRARY_ID||!config.BUNNY_API_KEY)fail(503,'Bunny Stream is not connected yet.');
  return request(`https://video.bunnycdn.com/library/${config.BUNNY_LIBRARY_ID}/videos/${encodeURIComponent(id)}`,{headers:{AccessKey:config.BUNNY_API_KEY}});
}
async function request(url,options){
  let r;try{r=await fetch(url,{...options,signal:AbortSignal.timeout(15000)});}catch{fail(502,'The connected service did not respond. Try again.');}
  if(!r.ok)fail(502,`Connected service returned ${r.status}. Check its configuration.`);return r.json();
}
export async function stripe(config,path,params=null,idempotency=null){
  if(!config.STRIPE_SECRET_KEY)fail(503,'Billing is not connected yet. No payment has been taken.');
  const headers={Authorization:`Bearer ${config.STRIPE_SECRET_KEY}`};if(idempotency)headers['Idempotency-Key']=idempotency;
  if(params)headers['Content-Type']='application/x-www-form-urlencoded';
  return request('https://api.stripe.com/v1/'+path,{method:params?'POST':'GET',headers,body:params?new URLSearchParams(params).toString():undefined});
}
export function destinationUrl(config,scanId){
  if(!config.COMMERCE_URL)fail(503,'The venue shop is not connected yet.');
  const url=new URL(config.COMMERCE_URL);if(url.protocol!=='https:')fail(503,'Commerce requires HTTPS.');
  url.searchParams.set('mixx_scan',scanId);return url.toString();
}
