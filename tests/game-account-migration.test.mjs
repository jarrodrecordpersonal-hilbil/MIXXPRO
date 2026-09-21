import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../apps/server/db.mjs';

test('account/team upgrade preserves existing guests, credentials and picks and reopens idempotently',()=>{
 const dir=mkdtempSync(join(tmpdir(),'game-account-upgrade-')),path=join(dir,'qa.sqlite');
 let db;
 try{
  const raw=new DatabaseSync(path),migrations=new URL('../packages/db/migrations/',import.meta.url);
  for(const name of readdirSync(migrations).filter(n=>/^\d+.*\.sql$/.test(n)&&Number(n.slice(0,3))<=10).sort())raw.exec(readFileSync(new URL(name,migrations),'utf8'));
  raw.exec("INSERT INTO tasting_events(id,code,name,status,created_at,updated_at) VALUES('old','OLD','Old event','live',1,1); INSERT INTO tasting_entries(id,event_id,seed,name) VALUES('a','old',1,'A'),('b','old',2,'B'); INSERT INTO tasting_matchups(id,event_id,round,slot,entry_a_id,entry_b_id) VALUES('match','old',1,1,'a','b'); INSERT INTO game_participants VALUES('p','old','secret-hash','Guest',1,1); INSERT INTO game_participant_credentials VALUES('old','secret-hash','p',1,NULL); INSERT INTO game_predictions VALUES('p','match','bracket','','a',1);");
  raw.close();
  for(let attempt=0;attempt<2;attempt++){
   db=openDatabase(path);
   assert.equal(db.get('SELECT COUNT(*) n FROM game_profiles').n,0);
   assert.equal(db.get('SELECT COUNT(*) n FROM game_team_rules').n,0,'do not invent team rules for in-progress events');
   assert.equal(db.get('SELECT display_name FROM game_participants WHERE id=?','p').display_name,'Guest');
   assert.equal(db.get('SELECT entry_id FROM game_predictions WHERE participant_id=?','p').entry_id,'a');
   assert.equal(db.get('SELECT credential_hash FROM game_participant_credentials WHERE participant_id=?','p').credential_hash,'secret-hash');
   assert.equal(db.get('SELECT COUNT(*) n FROM migrations WHERE version=11').n,1);
   assert.deepEqual(db.all('PRAGMA foreign_key_check'),[]);db.close();db=null;
  }
 }finally{db?.close();rmSync(dir,{recursive:true,force:true});}
});
