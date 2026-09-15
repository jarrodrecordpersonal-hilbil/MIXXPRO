import {randomBytes,createHash,createHmac,timingSafeEqual,scrypt as rawScrypt} from 'node:crypto';
import {promisify} from 'node:util';
import {fail} from '../../packages/domain/src/runtime.mjs';
const scrypt=promisify(rawScrypt);
export const token=(bytes=24)=>randomBytes(bytes).toString('base64url');
export const hash=s=>createHash('sha256').update(s).digest('hex');
export const mac=(key,s)=>createHmac('sha256',key).update(s).digest('hex');
export function equal(a,b){return typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
export async function passwordHash(password){const salt=token(16);const derived=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});return `${salt}:${derived.toString('hex')}`;}
export async function verifyPassword(password,stored){const [salt,digest]=stored.split(':');const derived=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});return equal(derived.toString('hex'),digest);}
export function verifyHook(raw,header,secret,now=Date.now()){
  if(!secret)fail(503,'Webhook integration is not configured.');
  const parts=(header||'').split(',');const timestamp=parts.find(x=>x.startsWith('t='))?.slice(2);
  const sigs=parts.filter(x=>x.startsWith('v1=')).map(x=>x.slice(3));
  if(!timestamp||!/^\d+$/.test(timestamp)||Math.abs(now/1000-Number(timestamp))>300||!sigs.some(s=>equal(s,mac(secret,`${timestamp}.${raw}`))))fail(401,'Invalid or expired webhook signature.');
}
export function rateLimit(db,key,max,windowMs,now=Date.now()){
  db.run('DELETE FROM rate_limits WHERE expires_at<?',now);
  db.run('INSERT INTO rate_limits(key,hits,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1',key,now+windowMs);
  if(db.get('SELECT hits FROM rate_limits WHERE key=?',key).hits>max)fail(429,'Too many attempts. Please try again later.');
}
