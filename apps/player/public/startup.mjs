/** Never treat a slow IndexedDB credential read as an unpaired TV. */
const defaultSleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function loadSavedCredential(read,{timeoutMs=10000,retryDelayMs=5000,onRetry=()=>{},sleep=defaultSleep}={}){
  if(typeof read!=='function')throw new TypeError('A TV storage reader is required.');
  while(true){
    let timer;
    try{
      const record=await Promise.race([
        Promise.resolve().then(read),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('TV storage read timed out.')),timeoutMs);})
      ]);
      return record?.value||null;
    }catch(error){onRetry(error);}
    finally{clearTimeout(timer);}
    await sleep(retryDelayMs);
  }
}
