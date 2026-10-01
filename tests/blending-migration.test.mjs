import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../apps/server/db.mjs';

test('migration 013 upgrades actual version-12 data without replacing accounts, credentials, picks, results or existing migrations',()=>{
 const directory=mkdtempSync(join(tmpdir(),'blend-upgrade-')),path=join(directory,'test.sqlite');let db;
 try {
  const raw=new DatabaseSync(path),migrations=new URL('../packages/db/migrations/',import.meta.url);
  for (const file of readdirSync(migrations).filter(n=>/^\d+.*\.sql$/.test(n)&&Number(n.slice(0,3))<=12).sort()) raw.exec(readFileSync(new URL(file,migrations),'utf8'));
  raw.exec("INSERT INTO users(id,email,password_hash,name,created_at) VALUES('account','test@example.test','synthetic','Saved player',1); INSERT INTO game_profiles VALUES('account','Saved player',1); INSERT INTO tasting_events(id,code,name,status,created_at,updated_at) VALUES('old','OLD','Existing event','live',1,1); INSERT INTO tasting_entries(id,event_id,seed,name) VALUES('a','old',1,'A'),('b','old',2,'B'); INSERT INTO tasting_matchups(id,event_id,round,slot,entry_a_id,entry_b_id) VALUES('match','old',1,1,'a','b'); INSERT INTO game_participants VALUES('player','old','hash','Saved player',1,1); INSERT INTO game_participant_credentials VALUES('old','hash','player',1,NULL); INSERT INTO game_account_participants VALUES('account','old','player',1); INSERT INTO game_predictions VALUES('player','match','bracket','','a',1); INSERT INTO tasting_outcomes VALUES('match','a',1,1,NULL);");
  const previous=raw.prepare('SELECT version,applied_at FROM migrations ORDER BY version').all();raw.close();
  for(let attempt=0;attempt<2;attempt++){
   db=openDatabase(path);
   assert.deepEqual(db.all('SELECT version,applied_at FROM migrations WHERE version<=12 ORDER BY version'),previous);
   assert.equal(db.get('SELECT COUNT(*) n FROM migrations WHERE version=13').n,1);
   assert.equal(db.get('SELECT participant_id FROM game_account_participants').participant_id,'player');
   assert.equal(db.get('SELECT entry_id FROM game_predictions').entry_id,'a');
   assert.equal(db.get('SELECT winner_entry_id FROM tasting_outcomes').winner_entry_id,'a');
   assert.equal(db.get('SELECT credential_hash FROM game_participant_credentials').credential_hash,'hash');
   for(const name of ['blend_seasons','blend_batches','blend_teams','blend_recipes','blend_scorecards','blend_qualifications'])assert.equal(db.get('SELECT COUNT(*) n FROM '+name).n,0,'never seed real databases');
   assert.deepEqual(db.all('PRAGMA foreign_key_check'),[]);db.close();db=null;
  }
 } finally {db?.close();rmSync(directory,{recursive:true,force:true});}
});
