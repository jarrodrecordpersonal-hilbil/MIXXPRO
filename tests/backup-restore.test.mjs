import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,existsSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createVerifiedBackup} from '../scripts/backup-utils.mjs';

function fixture(t){
  const directory=mkdtempSync(join(tmpdir(),'mixxwave-backup-test-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const source=join(directory,'live.sqlite'),target=join(directory,'backups','verified.sqlite');
  const db=new DatabaseSync(source);
  db.exec("PRAGMA journal_mode=WAL; CREATE TABLE migrations(version INTEGER PRIMARY KEY); INSERT INTO migrations(version) VALUES(1); CREATE TABLE venues(id TEXT PRIMARY KEY,name TEXT NOT NULL);");
  db.prepare("INSERT INTO venues(id,name) VALUES(?,?)").run('venue-1','Real persisted venue');
  return {db,source,target,directory};
}

test('backup contains committed WAL records and an independently verified checksum',async t=>{
  const {db,source,target}=fixture(t);
  try{
    const result=await createVerifiedBackup(source,target);
    assert.equal(result.migrations,1);
    assert.ok(result.bytes>0);
    assert.equal(existsSync(result.checksumFile),true);
    const saved=new DatabaseSync(target,{readOnly:true});
    try{
      assert.equal(saved.prepare('SELECT name FROM venues WHERE id=?').get('venue-1').name,'Real persisted venue');
      assert.equal(saved.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    }finally{saved.close();}
    assert.equal(createHash('sha256').update(readFileSync(target)).digest('hex'),result.sha256);
    assert.match(readFileSync(result.checksumFile,'utf8'),new RegExp('^'+result.sha256+'  verified\\.sqlite\\n$'));
  }finally{db.close();}
});

test('backup refuses an incorrect or missing DB_PATH without creating a new empty database',async t=>{
  const {db,directory,target}=fixture(t);
  try{
    const missing=join(directory,'not-real.sqlite');
    await assert.rejects(createVerifiedBackup(missing,target),/does not exist/);
    assert.equal(existsSync(missing),false);
    assert.equal(existsSync(target),false);
    await assert.rejects(createVerifiedBackup(':memory:',target),/persistent SQLite/);
  }finally{db.close();}
});

test('backup refuses to overwrite an existing archive or the live database',async t=>{
  const {db,source,target}=fixture(t);
  try{
    await assert.rejects(createVerifiedBackup(source,source),/must differ/);
    await createVerifiedBackup(source,target);
    await assert.rejects(createVerifiedBackup(source,target),/already exists/);
  }finally{db.close();}
});

test('backup rejects random content rather than treating it as a MIXXWAVE database',async t=>{
  const {db,target,directory}=fixture(t);
  try{
    const invalid=join(directory,'broken.sqlite');
    writeFileSync(invalid,'not sqlite data');
    await assert.rejects(createVerifiedBackup(invalid,target),/database|SQLite|encrypted/i);
    assert.equal(existsSync(target),false);
  }finally{db.close();}
});

test('backup rejects a real SQLite file without MIXXWAVE migration history',async t=>{
  const {db,target,directory}=fixture(t);
  try{
    const unrelated=join(directory,'unrelated.sqlite');
    const other=new DatabaseSync(unrelated);
    other.exec('CREATE TABLE unrelated(id INTEGER PRIMARY KEY)');
    other.close();
    await assert.rejects(createVerifiedBackup(unrelated,target),/migration history missing/);
    assert.equal(existsSync(target),false);
  }finally{db.close();}
});
