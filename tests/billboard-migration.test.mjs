import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../apps/server/db.mjs';

test('billboard upgrade preserves existing promotions and accounts without publishing drafts or creating payouts',()=>{
 const directory=mkdtempSync(join(tmpdir(),'billboard-migration-')),file=join(directory,'qa.sqlite');let db;
 try{
  const raw=new DatabaseSync(file),migrations=new URL('../packages/db/migrations/',import.meta.url);
  for(const name of readdirSync(migrations).filter(n=>/^\d+.*\.sql$/.test(n)&&Number(n.slice(0,3))<=11).sort())raw.exec(readFileSync(new URL(name,migrations),'utf8'));
  raw.exec("INSERT INTO users(id,email,password_hash,name,created_at) VALUES('user','qa@example.test','synthetic','QA',1); INSERT INTO game_profiles VALUES('user','Public QA',1); INSERT INTO venues(id,name,type,timezone,mix,qr_code,referral_code,created_at) VALUES('venue','QA','other','UTC','{}','qr','ref',1); INSERT INTO promotions VALUES('legacy','venue','event','Existing event','Existing message',1,9999999999999,1,1);");raw.close();
  for(let attempt=0;attempt<2;attempt++){
   db=openDatabase(file);assert.equal(db.get('SELECT title FROM promotions WHERE id=?','legacy').title,'Existing event');assert.equal(db.get('SELECT active FROM promotions WHERE id=?','legacy').active,1);assert.equal(db.get('SELECT display_name FROM game_profiles').display_name,'Public QA');
   assert.equal(db.get('SELECT COUNT(*) n FROM venue_billboards').n,0);assert.equal(db.get('SELECT COUNT(*) n FROM ledger').n,0);assert.equal(db.get('SELECT COUNT(*) n FROM migrations WHERE version=12').n,1);assert.deepEqual(db.all('PRAGMA foreign_key_check'),[]);db.close();db=null;
  }
 }finally{db?.close();rmSync(directory,{recursive:true,force:true});}
});
