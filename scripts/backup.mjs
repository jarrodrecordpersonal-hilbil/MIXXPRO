import {configuration} from '../apps/server/app.mjs';
import {createVerifiedBackup} from './backup-utils.mjs';
import {resolve} from 'node:path';

const destination=resolve(process.argv[2]||`data/backups/mixxpro-${Date.now()}.sqlite`);
try{
  const outcome=await createVerifiedBackup(configuration().DB_PATH,destination);
  console.log('Verified MIXXWAVE database backup:',outcome.target);
  console.log('Bytes:',outcome.bytes,'SHA-256:',outcome.sha256);
  console.log('Checksum file:',outcome.checksumFile);
  console.log('Transfer both files to off-host private storage and test a restore.');
}catch(error){
  console.error('Backup not created:',error.message);
  process.exitCode=1;
}
