/** Durable player state, media blobs and telemetry. Nothing is stored only in a JS array. */
const database=new Promise((resolve,reject)=>{const request=indexedDB.open('mixxpro-tv-v2',1);request.onupgradeneeded=()=>{for(const name of ['kv','media','events'])request.result.createObjectStore(name,{keyPath:'key'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
async function operation(store,mode,fn){const db=await database;return new Promise((resolve,reject)=>{const transaction=db.transaction(store,mode);const request=fn(transaction.objectStore(store));let result;request.onsuccess=()=>result=request.result;transaction.oncomplete=()=>resolve(result);transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error||new Error('Storage operation aborted.'));});}
export const get=(store,key)=>operation(store,'readonly',s=>s.get(key));
export const put=(store,value)=>operation(store,'readwrite',s=>s.put(value));
export const remove=(store,key)=>operation(store,'readwrite',s=>s.delete(key));
export const all=store=>operation(store,'readonly',s=>s.getAll());
export const clear=store=>operation(store,'readwrite',s=>s.clear());
export async function cachedMedia(key,validAt=Date.now()){
  const found=await get('media',key);if(found&&found.expiresAt>validAt)return found;return null;
}
export async function cacheAsset(item,expiresAt,keepKey){
  const existing=await get('media',item.cacheKey);
  if(existing){existing.expiresAt=expiresAt;existing.usedAt=Date.now();await put('media',existing);return existing;}
  const estimate=await navigator.storage?.estimate?.()||{quota:512*1024**2};
  const budget=Math.min(2*1024**3,(estimate.quota||512*1024**2)*.4),maxFile=Math.min(300*1024**2,budget);
  const response=await fetch(item.url,{mode:'cors',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(90000)});
  if(!response.ok)throw Error(`Media download returned ${response.status}`);
  const contentLength=Number(response.headers.get('content-length')||0);if(contentLength>maxFile){await response.body.cancel();throw Error('Video exceeds the local per-file budget.');}
  const reader=response.body.getReader(),chunks=[];let bytes=0;
  while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>maxFile){await reader.cancel();throw Error('Video exceeds the local per-file budget.');}chunks.push(value);}
  let media=await all('media'),usage=media.reduce((n,m)=>n+m.bytes,0);
  for(const old of media.sort((a,b)=>a.usedAt-b.usedAt)){if(usage+bytes<=budget)break;if(old.key===keepKey)continue;await remove('media',old.key);usage-=old.bytes;}
  if(usage+bytes>budget)throw Error('Insufficient local media storage.');
  const record={key:item.cacheKey,blob:new Blob(chunks,{type:'video/mp4'}),bytes,duration:item.duration,expiresAt,usedAt:Date.now()};
  try{await put('media',record);}catch(e){if(e.name==='QuotaExceededError')throw Error('Browser storage quota is full.');throw e;}return record;
}
