import {hash,rateLimit} from './security.mjs';

// Signed-in TV traffic must not exhaust the generic peer-IP quota when many
// venues sit behind the same trusted hosting proxy. Invalid tokens and pairing
// requests still use the generic IP budget.
const deviceEndpoints=new Set([
  '/api/player/state','/api/player/heartbeat','/api/player/manifest',
  '/api/player/events','/api/player/ack'
]);

export function limitApiRequest(db,{path,ip,authorization},apply=rateLimit){
  if(deviceEndpoints.has(path)&&typeof authorization==='string'){
    const match=/^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(authorization);
    if(match){
      const active=db.get('SELECT id FROM tvs WHERE token_hash=? AND revoked=0',hash(match[1]));
      if(active){
        // Five calls/sec per authenticated player. Actual normal poll rate is
        // substantially lower; retries remain bounded per device.
        apply(db,`device-api:${active.id}`,300,60000);
        return 'device';
      }
    }
  }
  apply(db,`general:${ip}`,6000,60000);
  return 'peer';
}
