/** Create a verified, consistent SQLite backup without modifying the live database. */
import {DatabaseSync} from 'node:sqlite';
import {createReadStream,existsSync,mkdirSync,statSync,unlinkSync,writeFileSync} from 'node:fs';
import {resolve,dirname,basename} from 'node:path';
import {createHash} from 'node:crypto';

function inspect(db,phase){
  const name=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'").get();
  if(!name)throw Error(phase+': not a MIXXWAVE database (migration history missing).');
  const integrity=db.prepare('PRAGMA quick_check').get();
  if(integrity?.quick_check!=='ok')throw Error(phase+': SQLite integrity check failed.');
  if(db.prepare('PRAGMA foreign_key_check').get())throw Error(phase+': foreign key verification failed.');
  return db.prepare('SELECT COUNT(*) AS count FROM migrations').get().count;
}

export async function createVerifiedBackup(sourcePath,targetPath){
  if(!sourcePath||sourcePath===':memory:')throw Error('Set DB_PATH to the existing persistent SQLite file.');
  if(!targetPath)throw Error('A destination backup filename is required.');
  const source=resolve(sourcePath),target=resolve(targetPath),checksumFile=target+'.sha256';
  if(source===target)throw Error('Backup destination must differ from the live database.');
  if(!existsSync(source)||!statSync(source).isFile())throw Error('Source database does not exist; refusing to create an empty backup.');
  if(existsSync(target)||existsSync(checksumFile))throw Error('Backup destination already exists; refusing to overwrite.');
  mkdirSync(dirname(target),{recursive:true,mode:0o700});
  let sourceDb;
  try{
    // Open read-only: this command must never create or migrate a live database.
    sourceDb=new DatabaseSync(source,{readOnly:true});
    sourceDb.exec('PRAGMA busy_timeout=5000');
    inspect(sourceDb,'Source');
    sourceDb.prepare('VACUUM INTO ?').run(target);
  }catch(error){
    // Only delete a partial destination created by this invocation.
    if(existsSync(target))unlinkSync(target);
    throw error;
  }finally{sourceDb?.close();}
  try{
    const backed=new DatabaseSync(target,{readOnly:true});
    let migrations;
    try{migrations=inspect(backed,'Backup');}
    finally{backed.close();}
    const bytes=statSync(target).size;
    if(!bytes)throw Error('Backup is empty.');
    const hash=createHash('sha256');
    for await(const chunk of createReadStream(target))hash.update(chunk);
    const sha256=hash.digest('hex');
    writeFileSync(checksumFile,sha256+'  '+basename(target)+'\n',{flag:'wx',mode:0o600});
    return {source,target,checksumFile,bytes,sha256,migrations};
  }catch(error){
    if(existsSync(target))unlinkSync(target);
    if(existsSync(checksumFile))unlinkSync(checksumFile);
    throw error;
  }
}
