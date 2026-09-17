import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
export function openDatabase(path){
  if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700});
  const raw=new DatabaseSync(path);raw.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  raw.exec(readFileSync(new URL('../../packages/db/migrations/001_pilot.sql',import.meta.url),'utf8'));
  raw.exec(readFileSync(new URL('../../packages/db/migrations/002_music_requests.sql',import.meta.url),'utf8'));
  if(!raw.prepare('SELECT version FROM migrations WHERE version=3').get()){
    raw.exec('BEGIN IMMEDIATE');
    try{raw.exec(readFileSync(new URL('../../packages/db/migrations/003_screen_activity.sql',import.meta.url),'utf8'));raw.exec('COMMIT');}
    catch(error){raw.exec('ROLLBACK');raw.close();throw error;}
  }
  if(!raw.prepare('SELECT version FROM migrations WHERE version=4').get()){
    raw.exec('BEGIN IMMEDIATE');
    try{raw.exec(readFileSync(new URL('../../packages/db/migrations/004_venue_playback_controls.sql',import.meta.url),'utf8'));raw.exec('COMMIT');}
    catch(error){raw.exec('ROLLBACK');raw.close();throw error;}
  }
  return {raw,get:(sql,...v)=>raw.prepare(sql).get(...v),all:(sql,...v)=>raw.prepare(sql).all(...v),run:(sql,...v)=>raw.prepare(sql).run(...v),
    transaction(fn){raw.exec('BEGIN IMMEDIATE');try{const r=fn();if(r?.then)throw Error('Do not await inside a database transaction');raw.exec('COMMIT');return r;}catch(e){raw.exec('ROLLBACK');throw e;}},close:()=>raw.close()};
}
